const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  scholarship: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scholarship',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  matchScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  studentSnapshot: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    educationLevel: { type: String, default: '' },
    courses: [{ type: String }],
    gpa: { type: Number, default: null },
    gpaScale: { type: Number, default: 10 },
    annualFamilyIncome: { type: Number, default: null },
    state: { type: String, default: '' },
    gender: { type: String, default: '' },
    category: { type: String, default: '' }
  },
  decisionNotes: {
    type: String,
    maxlength: 500,
    default: ''
  },
  appliedAt: {
    type: Date,
    default: Date.now
  },
  decidedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Prevent duplicate applications by the same student to the same scholarship
applicationSchema.index({ scholarship: 1, student: 1 }, { unique: true });
applicationSchema.index({ provider: 1, status: 1 });
applicationSchema.index({ student: 1 });

module.exports = mongoose.models.Application || mongoose.model('Application', applicationSchema);
