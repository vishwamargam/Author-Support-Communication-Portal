const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', required: true, index: true },
  senderId: { type: String, ref: 'User', required: true },
  senderRole: { type: String, enum: ['author', 'admin'], required: true },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
  visibility: { type: String, enum: ['public', 'internal'], default: 'public', required: true, index: true }
}, { timestamps: true, versionKey: false });

messageSchema.index({ ticketId: 1, createdAt: 1 });
// Safety default: direct author-facing serialization never includes internal notes.
messageSchema.methods.toAuthorJSON = function toAuthorJSON() {
  if (this.visibility === 'internal') return null;
  return { id: this.id, ticketId: this.ticketId, senderId: this.senderId,
    senderRole: this.senderRole, body: this.body, createdAt: this.createdAt };
};
module.exports = mongoose.model('Message', messageSchema);
