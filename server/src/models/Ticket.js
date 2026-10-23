const mongoose = require('mongoose');

const CATEGORIES = [
  'Royalty & Payments', 'ISBN & Metadata Issues', 'Printing & Quality',
  'Distribution & Availability', 'Book Status & Production Updates', 'General Inquiry'
];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['Open', 'In Progress', 'Waiting on Author', 'Resolved', 'Closed'];
const auditEntrySchema = new mongoose.Schema({
  actorId: { type: String, ref: 'User', required: true },
  eventType: { type: String, enum: ['status_changed', 'category_changed', 'priority_changed', 'assigned', 'public_reply_sent', 'internal_note_added'], required: true },
  field: { type: String, enum: ['status', 'category', 'priority', 'assignedTo', null], default: null },
  fromValue: { type: String, default: null },
  toValue: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, required: true }
}, { _id: false, versionKey: false });

const classificationSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
  category: { type: String, enum: CATEGORIES, default: null },
  priority: { type: String, enum: PRIORITIES, default: null },
  priorityExplanation: { type: String, maxlength: 500, default: null },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  processedAt: { type: Date, default: null },
  errorCode: { type: String, default: null }
}, { _id: false });

const draftSchema = new mongoose.Schema({
  status: { type: String, enum: ['not_requested', 'generating', 'complete', 'failed'], default: 'not_requested' },
  text: { type: String, maxlength: 10000, default: null },
  articleIds: { type: [String], default: [] },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  generatedAt: { type: Date, default: null },
  errorCode: { type: String, default: null }
}, { _id: false });

const ticketSchema = new mongoose.Schema({
  authorId: { type: String, ref: 'User', required: true, index: true },
  bookId: { type: String, ref: 'Book', default: null, index: true },
  subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 180 },
  status: { type: String, enum: STATUSES, default: 'Open', index: true },
  category: { type: String, enum: CATEGORIES, default: 'General Inquiry', index: true },
  categorySource: { type: String, enum: ['default', 'ai', 'human'], default: 'default' },
  priority: { type: String, enum: PRIORITIES, default: 'Medium', index: true },
  prioritySource: { type: String, enum: ['default', 'ai', 'human'], default: 'default' },
  priorityScore: { type: Number, min: 0, max: 100, default: null },
  aiClassification: { type: classificationSchema, default: () => ({}) },
  aiDraft: { type: draftSchema, default: () => ({}) },
  assignedTo: { type: String, ref: 'User', default: null, index: true },
  auditTrail: { type: [auditEntrySchema], default: [] },
  lastActivityAt: { type: Date, default: Date.now, index: true },
  closedAt: { type: Date, default: null }
}, { timestamps: true, versionKey: false });

ticketSchema.index({ status: 1, lastActivityAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ authorId: 1, lastActivityAt: -1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.statics.categories = CATEGORIES;
ticketSchema.statics.statuses = STATUSES;
ticketSchema.statics.priorities = PRIORITIES;
module.exports = mongoose.model('Ticket', ticketSchema);
