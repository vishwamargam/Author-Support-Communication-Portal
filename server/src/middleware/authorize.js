const ApiError = require('../utils/ApiError');

module.exports = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required.'));
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'FORBIDDEN', 'You do not have access to this resource.'));
  return next();
};
