const router = require('express').Router();
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncRoute = require('../middleware/asyncRoute');
const ApiError = require('../utils/ApiError');

router.use(authenticate);
router.get('/me', authorize('author'), asyncRoute(async (req, res) => {
  const author = await User.findOne({ _id: req.user.id, role: 'author', isActive: true });
  if (!author) throw new ApiError(404, 'AUTHOR_NOT_FOUND', 'Author profile not found.');
  res.json({ data: { author } });
}));
router.get('/', authorize('admin'), asyncRoute(async (_req, res) => {
  const authors = await User.find({ role: 'author' }).sort({ name: 1 });
  res.json({ data: { authors } });
}));
router.get('/:authorId', authorize('author', 'admin'), asyncRoute(async (req, res) => {
  if (req.user.role === 'author' && req.params.authorId !== req.user.id) {
    throw new ApiError(404, 'AUTHOR_NOT_FOUND', 'Author profile not found.');
  }
  const author = await User.findOne({ _id: req.params.authorId, role: 'author' });
  if (!author) throw new ApiError(404, 'AUTHOR_NOT_FOUND', 'Author profile not found.');
  res.json({ data: { author } });
}));

module.exports = router;
