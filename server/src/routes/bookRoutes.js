const router = require('express').Router();
const Book = require('../models/Book');
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const asyncRoute = require('../middleware/asyncRoute');
const ApiError = require('../utils/ApiError');

router.use(authenticate, authorize('author', 'admin'));
router.get('/', asyncRoute(async (req, res) => {
  let filter = { authorId: req.user.id };
  if (req.user.role === 'admin') {
    const authorId = req.query.authorId;
    if (authorId !== undefined && (typeof authorId !== 'string' || !authorId.trim())) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'authorId must be a non-empty string.');
    }
    if (authorId && !(await User.exists({ _id: authorId, role: 'author' }))) {
      throw new ApiError(404, 'AUTHOR_NOT_FOUND', 'Author profile not found.');
    }
    filter = authorId ? { authorId } : {};
  }
  const books = await Book.find(filter).sort({ title: 1 });
  res.json({ data: { books } });
}));

module.exports = router;
