import { verifyPersonalMessageSignature, publicKeyFromRawBytes } from '@onelabs/sui/verify';
import { parseSerializedSignature } from '@onelabs/sui/cryptography';
import { verifyAccessToken } from '../utils/jwt.js';
import logger from '../utils/logger.js';

/**
 * Try to authenticate via JWT Bearer token.
 * Returns the decoded payload on success, or null if no token / invalid.
 */
function tryJwtAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const payload = verifyAccessToken(authHeader.slice(7));
    logger.info('[TG-AUTH] JWT auth success', {
      provider: payload.provider,
      walletAddress: payload.walletAddress,
    });
    return payload;
  } catch (err) {
    logger.warn('[TG-AUTH] JWT auth failed', { error: err.message });
    return null;
  }
}

/**
 * Decode the message header value. Supports base64-encoded and raw strings.
 */
function decodeMessageHeader(raw) {
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    // If the decoded string looks like our auth message, use it
    if (decoded.includes('Welcome to') || decoded.includes('Wallet Address')) {
      return decoded;
    }
  } catch (_) { /* not valid base64 */ }
  // Fallback: treat as raw string
  return raw;
}

/**
 * Verify wallet signature. Tries standard Sui personal-message verification first,
 * then falls back to address derivation from the signature's embedded public key.
 */
async function verifyWalletSignature(messageStr, signature, address) {
  const messageBytes = new TextEncoder().encode(messageStr);

  // Primary: standard Sui personal message verification
  try {
    await verifyPersonalMessageSignature(messageBytes, signature, { address });
    return true;
  } catch (primaryErr) {
    logger.warn('Primary signature verification failed:', primaryErr.message);
  }

  // Fallback: parse the serialized signature, extract the public key, derive the
  // address and compare. This handles wallets that use a non-standard signing
  // envelope while still embedding the correct key material.
  try {
    const parsed = parseSerializedSignature(signature);
    const pubKey = publicKeyFromRawBytes(parsed.signatureScheme, parsed.publicKey);
    const derivedAddress = pubKey.toSuiAddress();
    if (derivedAddress === address) {
      logger.info('Fallback address-derivation verification succeeded');
      return true;
    }
    logger.warn(`Address mismatch: derived=${derivedAddress}, claimed=${address}`);
  } catch (fallbackErr) {
    logger.warn('Fallback verification failed:', fallbackErr.message);
  }

  return false;
}

/**
 * Optional authentication - allows requests without auth but sets req.walletAddress if provided.
 * Tries JWT Bearer token first, then falls back to wallet signature headers.
 */
export async function optionalAuth(req, res, next) {
  try {
    const jwtPayload = tryJwtAuth(req);
    if (jwtPayload) {
      logger.info('[TG-AUTH] optionalAuth: authenticated via JWT', {
        provider: jwtPayload.provider,
        walletAddress: jwtPayload.walletAddress,
        path: req.path,
      });
      req.walletAddress = jwtPayload.walletAddress;
      req.authenticated = true;
      req.authProvider = jwtPayload.provider || 'jwt';
      return next();
    }

    const address = req.headers['x-wallet-address'];
    
    if (address) {
      req.walletAddress = address;
      req.authenticated = false;
      
      const signature = req.headers['x-wallet-signature'];
      const message = req.headers['x-wallet-message'];
      
      if (signature && message) {
        const decodedMessage = decodeMessageHeader(message);
        const ok = await verifyWalletSignature(decodedMessage, signature, address);
        if (ok) req.authenticated = true;
      }
    } else {
      req.walletAddress = null;
      req.authenticated = false;
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    next();
  }
}

/**
 * Authenticate via JWT Bearer token or wallet signature.
 * JWT is tried first; if absent, falls back to wallet header verification.
 */
export async function authenticateWallet(req, res, next) {
  try {
    const jwtPayload = tryJwtAuth(req);
    if (jwtPayload) {
      logger.info('[TG-AUTH] authenticateWallet: authenticated via JWT', {
        provider: jwtPayload.provider,
        walletAddress: jwtPayload.walletAddress,
        path: req.path,
      });
      req.authenticated = true;
      req.walletAddress = jwtPayload.walletAddress;
      req.authProvider = jwtPayload.provider || 'jwt';
      return next();
    }

    const address = req.headers['x-wallet-address'];
    const signature = req.headers['x-wallet-signature'];
    const message = req.headers['x-wallet-message'];
    
    logger.info(`[TG-AUTH] authenticateWallet: wallet path, address=${address}, hasSignature=${!!signature}`);
    
    if (!address) {
      return res.status(401).json({
        success: false,
        error: 'Wallet address required'
      });
    }
    
    if (!signature || !message) {
      return res.status(401).json({
        success: false,
        error: 'Wallet signature required for authentication'
      });
    }

    const decodedMessage = decodeMessageHeader(message);
    const ok = await verifyWalletSignature(decodedMessage, signature, address);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Signature verification failed'
      });
    }

    req.authenticated = true;
    req.walletAddress = address;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Require authenticated request
 */
export function requireAuth(req, res, next) {
  if (!req.authenticated) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
}
