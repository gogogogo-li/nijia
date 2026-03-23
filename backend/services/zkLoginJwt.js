import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const JWT_EXPIRY = '15m';

let rsaPrivateKey = null;
let rsaPublicKey = null;
let jwksCache = null;

function getIssuer() {
  return process.env.ZKLOGIN_JWT_ISSUER || 'https://ninja-api.onechainops.com';
}

function getAudience() {
  return process.env.ZKLOGIN_JWT_AUDIENCE || 'onechain-ninja';
}

/**
 * Load or generate the RSA keypair used for zkLogin JWT signing.
 * In production, ZKLOGIN_RSA_PRIVATE_KEY must be set (PEM-encoded).
 * In development, a transient keypair is generated on first call.
 */
function ensureKeypair() {
  if (rsaPrivateKey) return;

  const envKey = process.env.ZKLOGIN_RSA_PRIVATE_KEY;
  if (envKey) {
    rsaPrivateKey = envKey.replace(/\\n/g, '\n');
    rsaPublicKey = crypto.createPublicKey(rsaPrivateKey).export({ type: 'spki', format: 'pem' });
    logger.info('[zkLoginJwt] RSA keypair loaded from env');
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ZKLOGIN_RSA_PRIVATE_KEY must be set in production');
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  rsaPrivateKey = privateKey;
  rsaPublicKey = publicKey;
  logger.warn('[zkLoginJwt] Generated transient RSA keypair (dev only — set ZKLOGIN_RSA_PRIVATE_KEY for production)');
}

/**
 * Sign a zkLogin-compatible JWT for a Telegram user.
 *
 * @param {string} telegramUserId
 * @param {string} nonce - the zkLogin nonce binding the ephemeral public key
 * @returns {string} signed JWT (RS256)
 */
export function signZkLoginJwt(telegramUserId, nonce) {
  ensureKeypair();

  const payload = {
    sub: `tg_${telegramUserId}`,
    aud: getAudience(),
    nonce,
  };

  logger.info('[zkLoginJwt] signZkLoginJwt called', {
    sub: payload.sub,
    aud: payload.aud,
    iss: getIssuer(),
    noncePrefix: nonce?.substring(0, 12),
  });

  const token = jwt.sign(payload, rsaPrivateKey, {
    algorithm: 'RS256',
    issuer: getIssuer(),
    expiresIn: JWT_EXPIRY,
    keyid: 'zklogin-rsa-1',
  });

  logger.info('[zkLoginJwt] JWT signed OK', { tokenLength: token.length });
  return token;
}

/**
 * Return the JWKS representation of the public key.
 * Cached after first build.
 */
export function getJwks() {
  if (jwksCache) return jwksCache;

  ensureKeypair();

  const pubKeyObj = crypto.createPublicKey(rsaPublicKey);
  const jwk = pubKeyObj.export({ format: 'jwk' });

  jwksCache = {
    keys: [
      {
        ...jwk,
        kid: 'zklogin-rsa-1',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };

  return jwksCache;
}

/**
 * Verify a zkLogin JWT (used server-side to validate tokens we issued).
 * @param {string} token
 * @returns {object} decoded payload
 */
export function verifyZkLoginJwt(token) {
  ensureKeypair();
  const decoded = jwt.verify(token, rsaPublicKey, {
    algorithms: ['RS256'],
    issuer: getIssuer(),
    audience: getAudience(),
  });
  logger.info('[zkLoginJwt] verifyZkLoginJwt OK', {
    sub: decoded.sub,
    iss: decoded.iss,
    aud: decoded.aud,
    exp: decoded.exp,
  });
  return decoded;
}
