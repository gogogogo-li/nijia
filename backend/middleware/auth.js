import { verifyPersonalMessageSignature } from '@onelabs/sui/verify';
import logger from '../utils/logger.js';

/**
 * Optional authentication - allows requests without auth but sets req.walletAddress if provided
 */
export async function optionalAuth(req, res, next) {
  try {
    const address = req.headers['x-wallet-address'];
    
    if (address) {
      req.walletAddress = address;
      req.authenticated = false;
      
      const signature = req.headers['x-wallet-signature'];
      const message = req.headers['x-wallet-message'];
      
      // If signature provided, verify it
      if (signature && message) {
        try {
          const isValid = await verifyPersonalMessageSignature(
            message,
            signature,
            address
          );
          
          if (isValid) {
            req.authenticated = true;
          }
        } catch (error) {
          logger.warn('Signature verification failed:', error);
        }
      }
    } else {
      // No address provided - that's okay for optional auth
      req.walletAddress = null;
      req.authenticated = false;
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    next(); // Continue anyway for optional auth
  }
}

/**
 * Authenticate wallet by verifying signature
 */
export async function authenticateWallet(req, res, next) {
  try {
    const address = req.headers['x-wallet-address'];
    const signature = req.headers['x-wallet-signature'];
    const message = req.headers['x-wallet-message'];
    
    if (!address) {
      return res.status(401).json({
        success: false,
        error: 'Wallet address required'
      });
    }
    
    // If signature provided, verify it
    if (signature && message) {
      try {
        const isValid = await verifyPersonalMessageSignature(
          message,
          signature,
          address
        );
        
        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: 'Invalid signature'
          });
        }
        
        req.authenticated = true;
      } catch (error) {
        logger.warn('Signature verification failed:', error);
        req.authenticated = false;
      }
    } else {
      req.authenticated = false;
    }
    
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
