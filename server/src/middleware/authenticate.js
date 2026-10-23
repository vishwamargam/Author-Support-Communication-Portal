const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { sessionCookieName } = require('../utils/sessionCookies');

module.exports = async function authenticate(req, _res, next) {
  try {
    const config = getConfig();
    const portal = req.get('x-bookleaf-portal');
    if (portal && !['author', 'admin'].includes(portal)) {
      throw new ApiError(400, 'INVALID_PORTAL', 'X-BookLeaf-Portal must be author or admin.');
    }
    const roles = portal ? [portal] : ['author', 'admin'];
    let user = null;
    let token = null;
    for (const role of roles) {
      const candidate = req.cookies?.[sessionCookieName(config, role)];
      if (!candidate) continue;
      let payload;
      try {
        payload = jwt.verify(candidate, config.jwtSecret, {
          issuer: 'bookleaf-author-support', audience: 'bookleaf-portal', algorithms: ['HS256']
        });
      } catch (_error) { /* Try the other role cookie when no portal is specified. */ }
      if (!payload) continue;
      const candidateUser = await User.findOne({ _id: payload.sub, isActive: true });
      if (candidateUser && candidateUser.role === role && payload.role === role) {
        user = candidateUser;
        token = candidate;
        break;
      }
    }
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in is required or the session is invalid.');
    req.user = { id: user.id, role: user.role, name: user.name, email: user.email };
    req.sessionToken = token;
    return next();
  } catch (error) {
    return next(error);
  }
};
