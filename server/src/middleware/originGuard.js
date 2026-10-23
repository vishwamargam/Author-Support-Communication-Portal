const ApiError = require('../utils/ApiError');

module.exports = (allowedOrigins) => (req, _res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return next(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.'));
  }
  return next();
};
