import { SuiClient } from '@onelabs/sui/client';
import { Ed25519Keypair } from '@onelabs/sui/keypairs/ed25519';
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
} from '@onelabs/sui/zklogin';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
const PROVER_URL = process.env.REACT_APP_ZKLOGIN_PROVER_URL || 'https://prover-testnet.onelabs.cc/v1';

const STORAGE_KEYS = {
  EPHEMERAL_KEYPAIR: 'ninja_ephemeral_keypair',
  RANDOMNESS: 'ninja_zk_randomness',
  MAX_EPOCH: 'ninja_max_epoch',
  ZK_LOGIN_DATA: 'ninja_zklogin_data',
};

const EPOCH_OFFSET = 10;

class ZkLoginService {
  constructor() {
    const backendUrl = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001';
    this.suiClient = new SuiClient({ url: `${backendUrl}/api/rpc` });
    this.onStepChange = null;
    this._stepStart = null;
    this._flowStart = null;
  }

  _setStep(step) {
    const now = performance.now();
    if (this._stepStart) {
      console.log('[zkLogin] step completed in', Math.round(now - this._stepStart) + 'ms');
    }
    this._stepStart = now;
    console.log('[zkLogin] ── step:', step);
    if (this.onStepChange) this.onStepChange(step);
  }

  /**
   * Step 1: Generate ephemeral keypair, fetch current epoch, compute nonce.
   */
  async prepareZkLoginMaterials() {
    this._setStep('preparing');

    const ephemeralKeypair = new Ed25519Keypair();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey();
    console.log('[zkLogin] ephemeral pubkey:', ephemeralPubKey.toBase64().substring(0, 16) + '...');

    console.log('[zkLogin] fetching current epoch from RPC...');
    const { epoch } = await this.suiClient.getLatestSuiSystemState();
    const maxEpoch = Number(epoch) + EPOCH_OFFSET;
    console.log('[zkLogin] current epoch:', epoch, '→ maxEpoch:', maxEpoch);

    const randomness = generateRandomness();
    const nonce = generateNonce(ephemeralPubKey, maxEpoch, randomness);

    sessionStorage.setItem(STORAGE_KEYS.EPHEMERAL_KEYPAIR, ephemeralKeypair.getSecretKey());
    sessionStorage.setItem(STORAGE_KEYS.RANDOMNESS, randomness);
    sessionStorage.setItem(STORAGE_KEYS.MAX_EPOCH, String(maxEpoch));

    console.log('[zkLogin] materials ready:', {
      maxEpoch,
      nonce: nonce.substring(0, 12) + '...',
      randomness: randomness.substring(0, 12) + '...',
    });

    return { ephemeralKeypair, ephemeralPubKey, maxEpoch, randomness, nonce };
  }

  /**
   * Step 2: Send initData + nonce to backend; get back a zkLogin JWT (RS256).
   */
  async fetchZkLoginJwt(initData, nonce) {
    this._setStep('signing');
    console.log('[zkLogin] POST /api/auth/telegram with nonce, initData length:', initData.length);

    const res = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, nonce }),
    });

    console.log('[zkLogin] /telegram response status:', res.status);
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error('[zkLogin] /telegram failed:', data.error);
      throw new Error(data.error || 'Failed to get zkLogin JWT from backend');
    }

    if (!data.zkLoginJwt) {
      console.error('[zkLogin] /telegram response missing zkLoginJwt field, keys:', Object.keys(data).join(','));
      throw new Error('Backend did not return zkLoginJwt (nonce may not have been accepted)');
    }

    console.log('[zkLogin] JWT received, length:', data.zkLoginJwt.length,
      ', user:', data.user?.displayName, ', tgId:', data.user?.telegramUserId);
    return {
      zkLoginJwt: data.zkLoginJwt,
      sessionToken: data.token,
      sessionRefreshToken: data.refreshToken,
      telegramUser: data.user,
    };
  }

  /**
   * Step 3: Fetch deterministic salt from backend.
   */
  async fetchSalt(jwt) {
    this._setStep('salt');
    console.log('[zkLogin] POST /api/auth/salt, jwt length:', jwt.length);

    const res = await fetch(`${API_BASE_URL}/api/auth/salt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt }),
    });

    console.log('[zkLogin] /salt response status:', res.status);
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error('[zkLogin] /salt failed:', data.error);
      throw new Error(data.error || 'Failed to fetch salt');
    }

    console.log('[zkLogin] salt received, length:', data.salt.length, ', prefix:', data.salt.substring(0, 8) + '...');
    return data.salt;
  }

  /**
   * Step 4: Derive the on-chain address from JWT + salt.
   */
  deriveAddress(jwt, salt) {
    const address = jwtToAddress(jwt, salt);
    console.log('[zkLogin] address derived:', address);
    return address;
  }

  /**
   * Step 5: Request a ZK proof from the OneLabs prover.
   */
  async fetchZkProof({ jwt, salt, maxEpoch, randomness, ephemeralPublicKey }) {
    this._setStep('proving');

    const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(ephemeralPublicKey);

    console.log('[zkLogin] POST ZK Prover:', PROVER_URL);
    console.log('[zkLogin] prover request params:', {
      jwtLength: jwt.length,
      extEphPubKey: extendedEphemeralPublicKey.substring(0, 16) + '...',
      maxEpoch,
      saltPrefix: salt.substring(0, 8) + '...',
    });

    const proverStart = performance.now();
    const res = await fetch(PROVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt,
        extendedEphemeralPublicKey,
        maxEpoch: String(maxEpoch),
        jwtRandomness: randomness,
        salt,
        keyClaimName: 'sub',
      }),
    });

    const proverMs = Math.round(performance.now() - proverStart);
    console.log('[zkLogin] prover response status:', res.status, 'in', proverMs + 'ms');

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[zkLogin] prover error body:', text.substring(0, 200));
      throw new Error(`ZK Prover returned ${res.status}: ${text}`);
    }

    const proof = await res.json();
    console.log('[zkLogin] ZK proof received, keys:', Object.keys(proof).join(','));
    return proof;
  }

  /**
   * Step 6: Authenticate with the backend using the zkLogin address + proof.
   */
  async authenticate({ jwt, salt, zkLoginAddress, zkProof, ephemeralPublicKey, maxEpoch }) {
    this._setStep('authenticating');
    console.log('[zkLogin] POST /api/auth/zklogin, address:', zkLoginAddress);

    const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(ephemeralPublicKey);

    const res = await fetch(`${API_BASE_URL}/api/auth/zklogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt,
        salt,
        zkLoginAddress,
        zkProof,
        ephemeralPublicKey: extendedEphemeralPublicKey,
        maxEpoch,
      }),
    });

    console.log('[zkLogin] /zklogin response status:', res.status);
    const data = await res.json();
    if (!res.ok || !data.success) {
      console.error('[zkLogin] /zklogin failed:', data.error);
      throw new Error(data.error || 'zkLogin authentication failed');
    }

    console.log('[zkLogin] authentication complete:', {
      walletAddress: data.user?.walletAddress,
      displayName: data.user?.displayName,
      isNewUser: data.isNewUser,
    });
    return data;
  }

  /**
   * Orchestrate the complete zkLogin flow end-to-end.
   *
   * @param {string} initData - Telegram WebApp.initData
   * @param {function} [onStep] - callback called with step name for UI progress
   * @returns {{ token, refreshToken, user, zkLoginData }}
   */
  async fullFlow(initData, onStep) {
    if (onStep) this.onStepChange = onStep;
    this._flowStart = performance.now();
    console.log('[zkLogin] ══════ fullFlow START ══════');

    try {
      // 1. Prepare cryptographic materials
      const { ephemeralKeypair, ephemeralPubKey, maxEpoch, randomness, nonce } =
        await this.prepareZkLoginMaterials();

      // 2. Get zkLogin JWT from backend (validates initData, signs RS256 JWT)
      const { zkLoginJwt } = await this.fetchZkLoginJwt(initData, nonce);

      // 3. Fetch deterministic salt
      const salt = await this.fetchSalt(zkLoginJwt);

      // 4. Derive on-chain address
      const zkLoginAddress = this.deriveAddress(zkLoginJwt, salt);

      // 5. Get ZK proof (this is the slowest step, 5-15s)
      const zkProof = await this.fetchZkProof({
        jwt: zkLoginJwt,
        salt,
        maxEpoch,
        randomness,
        ephemeralPublicKey: ephemeralPubKey,
      });

      // 6. Final auth with backend
      const authResult = await this.authenticate({
        jwt: zkLoginJwt,
        salt,
        zkLoginAddress,
        zkProof,
        ephemeralPublicKey: ephemeralPubKey,
        maxEpoch,
      });

      // Persist zkLogin data for future transaction signing
      const zkLoginData = {
        zkProof,
        zkLoginAddress,
        salt,
        maxEpoch,
        randomness,
        ephemeralKeyPairSecret: ephemeralKeypair.getSecretKey(),
      };
      sessionStorage.setItem(STORAGE_KEYS.ZK_LOGIN_DATA, JSON.stringify(zkLoginData));

      this._setStep('done');
      const totalMs = Math.round(performance.now() - this._flowStart);
      console.log('[zkLogin] ══════ fullFlow SUCCESS ══════ total:', totalMs + 'ms, address:', zkLoginAddress);

      return {
        token: authResult.token,
        refreshToken: authResult.refreshToken,
        user: authResult.user,
        isNewUser: authResult.isNewUser,
        zkLoginData,
      };
    } catch (err) {
      this._setStep('error');
      const totalMs = Math.round(performance.now() - this._flowStart);
      console.error('[zkLogin] ══════ fullFlow FAILED ══════ total:', totalMs + 'ms, error:', err.message);
      throw err;
    } finally {
      this.onStepChange = null;
      this._stepStart = null;
      this._flowStart = null;
    }
  }
}

const zkLoginService = new ZkLoginService();
export default zkLoginService;
