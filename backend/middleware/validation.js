import { body, param, validationResult } from 'express-validator';

/**
 * Validation middleware factory
 */
export function validate(validations) {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    
    res.status(400).json({
      success: false,
      errors: errors.array()
    });
  };
}

/**
 * Common validations
 */
export const validations = {
  walletAddress: () =>
    body('walletAddress')
      .isString()
      .trim()
      .matches(/^0x[a-fA-F0-9]{64}$/)
      .withMessage('Invalid wallet address format'),
  
  gameId: () =>
    param('gameId')
      .isUUID()
      .withMessage('Invalid game ID'),
  
  betTier: () =>
    body('betTierId')
      .isInt({ min: 1, max: 4 })
      .withMessage('Invalid bet tier (must be 1-4)'),
  
  score: () =>
    body('finalScore')
      .isInt({ min: 0, max: 1000000 })
      .withMessage('Invalid score'),
  
  gameEvents: () =>
    body('gameEvents')
      .isArray()
      .withMessage('Game events must be an array'),
  
  transactionHash: () =>
    body('transactionHash')
      .optional()
      .isString()
      .trim()
      .matches(/^[A-Za-z0-9+/=]{43,88}$/)
      .withMessage('Invalid transaction hash format')
};
