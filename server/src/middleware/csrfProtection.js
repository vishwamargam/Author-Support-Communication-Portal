const { getConfig } = require('../config/env');
const { validCsrfToken, csrfCookieName } = require('../utils/sessionCookies');
const ApiError = require('../utils/ApiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const config = getConfig();
  const cookieToken = req.cookies?.[csrfCookieName(config, req.user?.role)];
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken !== headerToken || !validCsrfToken(cookieToken)) {
    return next(new ApiError(403, 'CSRF_INVALID', 'A valid CSRF token is required.'));
  }
  return next();
};
