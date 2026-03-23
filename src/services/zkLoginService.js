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
  }

  _setStep(step) {
    console.log('[zkLogin] step:', step);
    if (this.onStepChange) this.onStepChange(step);
  }

  /**
   * Step 1: Generate ephemeral keypair, fetch current epoch, compute nonce.
   */
  async prepareZkLoginMaterials() {
    this._setStep('preparing');

    const ephemeralKeypair = new Ed25519Keypair();
    const ephemeralPubKey = ephemeralKeypair.getPublicKey();

    const { epoch } = await this.suiClient.getLatestSuiSystemState();
    const maxEpoch = Number(epoch) + EPOCH_OFFSET;

    const randomness = generateRandomness();
    const nonce = generateNonce(ephemeralPubKey, maxEpoch, randomness);

    // Persist in sessionStorage so the keypair survives page state changes
    sessionStorage.setItem(STORAGE_KEYS.EPHEMERAL_KEYPAIR, ephemeralKeypair.getSecretKey());
    sessionStorage.setItem(STORAGE_KEYS.RANDOMNESS, randomness);
    sessionStorage.setItem(STORAGE_KEYS.MAX_EPOCH, String(maxEpoch));

    console.log('[zkLogin] materials prepared', { maxEpoch, nonceLength: nonce.length });

    return {
      ephemeralKeypair,
      ephemeralPubKey,
      maxEpoch,
      randomness,
      nonce,
    };
  }

  /**
   * Step 2: Send initData + nonce to backend; get back a zkLogin JWT (RS256).
   */
  async fetchZkLoginJwt(initData, nonce) {
    this._setStep('signing');

    const res = await fetch(`${API_BASE_URL}/api/auth/telegram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, nonce }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to get zkLogin JWT from backend');
    }

    if (!data.zkLoginJwt) {
      throw new Error('Backend did not return zkLoginJwt (nonce may not have been accepted)');
    }

    console.log('[zkLogin] JWT received', { hasZkLoginJwt: true });
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

    const res = await fetch(`${API_BASE_URL}/api/auth/salt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jwt }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch salt');
    }

    console.log('[zkLogin] salt received');
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

    console.log('[zkLogin] requesting ZK proof from', PROVER_URL);
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

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ZK Prover returned ${res.status}: ${text}`);
    }

    const proof = await res.json();
    console.log('[zkLogin] ZK proof received');
    return proof;
  }

  /**
   * Step 6: Authenticate with the backend using the zkLogin address + proof.
   */
  async authenticate({ jwt, salt, zkLoginAddress, zkProof, ephemeralPublicKey, maxEpoch }) {
    this._setStep('authenticating');

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

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'zkLogin authentication failed');
    }

    console.log('[zkLogin] authentication complete', { walletAddress: data.user?.walletAddress });
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

      return {
        token: authResult.token,
        refreshToken: authResult.refreshToken,
        user: authResult.user,
        isNewUser: authResult.isNewUser,
        zkLoginData,
      };
    } catch (err) {
      this._setStep('error');
      throw err;
    } finally {
      this.onStepChange = null;
    }
  }
}

const zkLoginService = new ZkLoginService();
export default zkLoginService;
