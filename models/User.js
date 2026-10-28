const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 160
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['student', 'provider'],
    required: true
  },
  // Applicable to Scholarship Providers:
  isVerified: {
    type: Boolean,
    default: false // New providers are unverified by default
  },
  organization: {
    orgName: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, lowercase: true, default: '' }
  },
  // Applicable to Students:
  profile: {
    educationLevel: {
      type: String,
      enum: ['Undergraduate', 'Postgraduate', 'Doctoral', 'Diploma', 'High School', ''],
      default: ''
    },
    courses: [{ type: String, trim: true }], // fields of study
    gpa: { type: Number, min: 0, max: 100, default: null },
    gpaScale: { type: Number, enum: [4, 10, 100], default: 10 },
    annualFamilyIncome: { type: Number, min: 0, default: null },
    state: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    gender: { type: String, enum: ['female', 'male', 'other', 'prefer_not_to_say', ''], default: '' },
    category: { type: String, trim: true, default: '' },
    institution: { type: String, trim: true, default: '' }
  },
  savedScholarships: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Scholarship'
  }]
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Safe user JSON output (exclude password)
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    isVerified: this.isVerified,
    organization: this.organization,
    profile: this.profile,
    savedScholarships: this.savedScholarships,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);

