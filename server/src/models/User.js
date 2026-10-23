const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String }, // Author IDs from source data (AUTH001 etc.) are preserved as Mongo IDs.
  role: { type: String, enum: ['author', 'admin'], required: true, index: true },
  name: { type: String, trim: true, required: true, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, required: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, trim: true, default: null },
  city: { type: String, trim: true, default: null },
  joinedDate: { type: Date, default: null },
  isActive: { type: Boolean, default: true, index: true }
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { transform(_doc, ret) { delete ret.passwordHash; return ret; } },
  toObject: { transform(_doc, ret) { delete ret.passwordHash; return ret; } }
});

userSchema.index({ role: 1, email: 1 });
module.exports = mongoose.model('User', userSchema);
