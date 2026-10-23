const router = require('express').Router();
const rateLimit = require('express-rate-limit').rateLimit;
const { login, currentUser, logout, csrf } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const csrfProtection = require('../middleware/csrfProtection');
const asyncRoute = require('../middleware/asyncRoute');
const ApiError = require('../utils/ApiError');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 100 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(new ApiError(429, 'LOGIN_RATE_LIMITED', 'Too many login attempts. Try again later.'));
  }
});

router.get('/auth/csrf', csrf);
router.post('/auth/login', loginLimiter, login);
router.get('/auth/me', authenticate, asyncRoute(currentUser));
router.post('/auth/logout', authenticate, csrfProtection, logout);
module.exports = router;
