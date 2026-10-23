const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { getConfig } = require('../config/env');
const { connectDatabase, disconnectDatabase } = require('../config/database');
const User = require('../models/User');
const Book = require('../models/Book');

const sourceCandidates = [
  process.env.SAMPLE_DATA_FILE,
  path.resolve(process.cwd(), '../bookleaf_sample_data.json'),
  path.resolve(process.cwd(), '../FULLSTACK-SAMPLEDATA.json'),
  path.resolve(process.cwd(), 'bookleaf_sample_data.json'),
  path.resolve(process.cwd(), 'FULLSTACK-SAMPLEDATA.json')
].filter(Boolean);

async function findSource() {
  for (const file of sourceCandidates) {
    try { await fs.access(file); return file; } catch (_error) { /* Try next supported name. */ }
  }
  throw new Error('Sample data file not found. Set SAMPLE_DATA_FILE or add bookleaf_sample_data.json / FULLSTACK-SAMPLEDATA.json.');
}

async function seed() {
  const config = getConfig({ requireSeedCredentials: true });
  const file = await findSource();
  const payload = JSON.parse(await fs.readFile(file, 'utf8'));
  if (!Array.isArray(payload.authors) || payload.authors.length !== 10) {
    throw new Error(`Expected exactly 10 authors in ${file}.`);
  }
  const bookCount = payload.authors.reduce((sum, author) => sum + (author.books || []).length, 0);
  if (bookCount !== 18) throw new Error(`Expected exactly 18 books in ${file}; found ${bookCount}.`);
  if (payload.authors.some((author) => !author.author_id || !author.email)) {
    throw new Error('Each sample author must have author_id and email.');
  }
  await connectDatabase(config.mongoUri);
  try {
    const authorHash = await bcrypt.hash(config.demoAuthorPassword, 12);
    const adminHash = await bcrypt.hash(config.adminPassword, 12);
    const authorDocs = payload.authors.map((author) => ({
      _id: author.author_id,
      role: 'author',
      name: author.name,
      email: author.email,
      passwordHash: authorHash,
      phone: author.phone ?? null,
      city: author.city ?? null,
      joinedDate: author.joined_date ? new Date(author.joined_date) : null,
      isActive: true
    }));
    const bookDocs = payload.authors.flatMap((author) => author.books.map((book) => ({
      _id: book.book_id,
      authorId: author.author_id,
      title: book.title,
      isbn: book.isbn,
      genre: book.genre,
      publicationDate: book.publication_date ? new Date(book.publication_date) : null,
      status: book.status,
      mrp: book.mrp ?? null,
      authorRoyaltyPerCopy: book.author_royalty_per_copy ?? null,
      totalCopiesSold: book.total_copies_sold,
      totalRoyaltyEarned: book.total_royalty_earned,
      royaltyPaid: book.royalty_paid,
      royaltyPending: book.royalty_pending,
      lastRoyaltyPayoutDate: book.last_royalty_payout_date ? new Date(book.last_royalty_payout_date) : null,
      printPartner: book.print_partner ?? null,
      availableOn: book.available_on || []
    })));

    // Upserts by stable source IDs make this repeatable and preserve existing tickets/users.
    await User.bulkWrite(authorDocs.map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $set: doc }, upsert: true }
    })), { ordered: true });
    await Book.bulkWrite(bookDocs.map((doc) => ({
      updateOne: { filter: { _id: doc._id }, update: { $set: doc }, upsert: true }
    })), { ordered: true });
    await User.updateOne({ _id: 'ADMIN001' }, { $set: {
      role: 'admin', name: 'BookLeaf Admin', email: config.adminEmail,
      passwordHash: adminHash, phone: null, city: null, joinedDate: null, isActive: true
    } }, { upsert: true, runValidators: true });

    const [authors, books, admin] = await Promise.all([
      User.countDocuments({ role: 'author' }), Book.countDocuments(), User.findById('ADMIN001').select('email')
    ]);
    console.log(`Seed complete from ${file}: ${authors} authors, ${books} books; admin ${admin.email}.`);
    console.log(`All sample authors sign in with their source email and the local DEMO_AUTHOR_PASSWORD value.`);
  } finally {
    await disconnectDatabase();
  }
}

if (require.main === module) {
  seed().catch(async (error) => {
    console.error('Seed failed:', error.message);
    if (mongoose.connection.readyState !== 0) await disconnectDatabase();
    process.exit(1);
  });
}

module.exports = { seed };
