const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  provider: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR', 'USD', 'GBP', 'EUR'], default: 'INR' },
  deadline: { type: Date, default: null },
  degreeLevels: [String],
  fieldsOfStudy: [String],
  minGPA: { type: Number, min: 0, max: 100, default: 0 },
  gpaScale: { type: Number, enum: [4, 10, 100], default: 10 },
  maxIncome: { type: Number, min: 0, default: null },
  locations: [String],
  genderRestriction: { type: String, enum: ['all', 'female', 'male', 'other'], default: 'all' },
  categoryRestriction: [String],
  institutionRestriction: [String],
  citizenship: [String],
  tags: [{ type: String, lowercase: true, trim: true }],
  applicationUrl: { type: String, default: '' },
  requiredDocuments: [String],
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  providerVerified: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false }
}, { timestamps: true });

schema.index({ title: 'text', provider: 'text', description: 'text', tags: 'text' });
schema.index({ status: 1, deadline: 1 });
schema.index({ createdBy: 1 });

module.exports = mongoose.models.Scholarship || mongoose.model('Scholarship', schema);
