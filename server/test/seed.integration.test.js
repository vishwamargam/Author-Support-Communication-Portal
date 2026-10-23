process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'seed-test-secret-with-more-than-thirty-two-characters';
process.env.SAMPLE_DATA_FILE = require('node:path').resolve(__dirname, '../../FULLSTACK-SAMPLEDATA.json');

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const source = require('../../FULLSTACK-SAMPLEDATA.json');
const User = require('../src/models/User');
const Book = require('../src/models/Book');

let mongo;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.DEMO_AUTHOR_PASSWORD = 'local-author-demo-password';
  process.env.ADMIN_EMAIL = 'admin@seed.test';
  process.env.ADMIN_PASSWORD = 'local-admin-demo-password';
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongo.stop();
});

test('sample seed preserves all source fields and remains repeatable', async () => {
  const { seed } = require('../src/seed/seed');
  await seed();
  await mongoose.connect(process.env.MONGODB_URI);

  const authors = await User.find({ role: 'author' }).sort({ _id: 1 }).select('+passwordHash').lean();
  const books = await Book.find().sort({ _id: 1 }).lean();
  assert.equal(authors.length, 10);
  assert.equal(books.length, 18);

  for (const author of source.authors) {
    const savedAuthor = authors.find((record) => record._id === author.author_id);
    assert.ok(savedAuthor, `Missing source author ${author.author_id}`);
    assert.equal(savedAuthor.email, author.email.toLowerCase());
    assert.equal(savedAuthor.name, author.name);
    assert.equal(await bcrypt.compare('local-author-demo-password', savedAuthor.passwordHash), true);
    for (const book of author.books) {
      const savedBook = books.find((record) => record._id === book.book_id);
      assert.ok(savedBook, `Missing source book ${book.book_id}`);
      assert.equal(savedBook.authorId, author.author_id);
      for (const [sourceKey, modelKey] of [
        ['title', 'title'], ['isbn', 'isbn'], ['genre', 'genre'], ['status', 'status'],
        ['mrp', 'mrp'], ['author_royalty_per_copy', 'authorRoyaltyPerCopy'],
        ['total_copies_sold', 'totalCopiesSold'], ['total_royalty_earned', 'totalRoyaltyEarned'],
        ['royalty_paid', 'royaltyPaid'], ['royalty_pending', 'royaltyPending'],
        ['print_partner', 'printPartner'], ['available_on', 'availableOn']
      ]) {
        assert.deepEqual(savedBook[modelKey], book[sourceKey] ?? (sourceKey === 'available_on' ? [] : null), `${book.book_id}.${sourceKey}`);
      }
      assert.equal(savedBook.publicationDate?.toISOString().slice(0, 10) ?? null, book.publication_date ?? null);
      assert.equal(savedBook.lastRoyaltyPayoutDate?.toISOString().slice(0, 10) ?? null, book.last_royalty_payout_date ?? null);
    }
  }

  const adminHash = (await User.findById('ADMIN001').select('+passwordHash')).passwordHash;
  assert.equal(await bcrypt.compare('local-admin-demo-password', adminHash), true);
  await seed();
  await mongoose.connect(process.env.MONGODB_URI);
  assert.equal(await User.countDocuments({ role: 'author' }), 10);
  assert.equal(await Book.countDocuments(), 18);
  assert.equal(await bcrypt.compare('local-author-demo-password', (await User.findById(authors[0]._id).select('+passwordHash')).passwordHash), true);

  const edgeBooks = books.filter((book) => book.publicationDate === null || book.mrp === null || book.totalCopiesSold === 0 || book.royaltyPaid === 0 || book.royaltyPending === 0 || book.status.includes('Production'));
  assert.ok(edgeBooks.length > 0, 'fixture must exercise null and zero-valued book fields');
  assert.ok(await Book.exists({ status: /Production/ }));
});
