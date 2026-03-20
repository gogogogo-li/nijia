import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '7d';

function getSecret(envKey, fallback) {
  const val = process.env[envKey];
  if (!val) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`${envKey} must be set in production`);
    }
    return fallback;
  }
  return val;
}

export function generateAccessToken(payload) {
  const secret = getSecret('JWT_SECRET', 'dev-jwt-secret-onechain-ninja');
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload) {
  const secret = getSecret('JWT_REFRESH_SECRET', 'dev-jwt-refresh-secret-onechain-ninja');
  return jwt.sign(payload, secret, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyAccessToken(token) {
  const secret = getSecret('JWT_SECRET', 'dev-jwt-secret-onechain-ninja');
  return jwt.verify(token, secret);
}

export function verifyRefreshToken(token) {
  const secret = getSecret('JWT_REFRESH_SECRET', 'dev-jwt-refresh-secret-onechain-ninja');
  return jwt.verify(token, secret);
}
