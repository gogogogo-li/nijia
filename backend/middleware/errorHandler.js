import logger from '../utils/logger.js';

/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}`;
  const isPgError = typeof err?.code === 'string' && !!err?.severity;

  logger.error('Error occurred', {
    requestId,
    errorName: err?.name,
    error: err?.message,
    stack: err?.stack,
    statusCode: err?.statusCode,
    path: req.path,
    method: req.method,
    query: req.query,
    bodyKeys: Object.keys(req.body || {}),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    pg: isPgError
      ? {
          code: err.code,
          severity: err.severity,
          detail: err.detail,
          hint: err.hint,
          table: err.table,
          column: err.column,
          constraint: err.constraint,
          routine: err.routine,
          where: err.where,
        }
      : undefined,
  });
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An error occurred'
    : err.message;
  
  res.status(err.statusCode || 500).json({
    success: false,
    error: message,
    requestId,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
