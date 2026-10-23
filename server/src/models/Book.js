const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  _id: { type: String }, // Source BK IDs are kept stable and reference User AUTH IDs.
  authorId: { type: String, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  isbn: { type: String, required: true, trim: true },
  genre: { type: String, required: true, trim: true },
  publicationDate: { type: Date, default: null },
  status: { type: String, required: true, trim: true, maxlength: 100 },
  mrp: { type: Number, min: 0, default: null },
  authorRoyaltyPerCopy: { type: Number, min: 0, default: null },
  totalCopiesSold: { type: Number, min: 0, required: true },
  totalRoyaltyEarned: { type: Number, min: 0, required: true },
  royaltyPaid: { type: Number, min: 0, required: true },
  royaltyPending: { type: Number, min: 0, required: true },
  lastRoyaltyPayoutDate: { type: Date, default: null },
  printPartner: { type: String, trim: true, default: null },
  availableOn: { type: [String], default: [] }
}, { timestamps: true, versionKey: false });

bookSchema.index({ authorId: 1, title: 1 });
bookSchema.index({ isbn: 1 });
module.exports = mongoose.model('Book', bookSchema);
