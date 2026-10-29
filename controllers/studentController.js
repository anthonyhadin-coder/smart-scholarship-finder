const User = require('../models/User');
const Scholarship = require('../models/Scholarship');
const Application = require('../models/Application');
const { scoreScholarship } = require('../utils/matchScorer');

async function getProfile(req, res, next) {
  try {
    res.json({
      success: true,
      data: req.user.profile || {}
    });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const b = req.body || {};
    const profile = req.user.profile || {};

    if (b.educationLevel !== undefined) {
      profile.educationLevel = String(b.educationLevel || '').trim();
    }
    if (b.courses !== undefined) {
      profile.courses = Array.isArray(b.courses)
        ? b.courses.map(c => String(c).trim()).filter(Boolean)
        : typeof b.courses === 'string'
        ? b.courses.split(',').map(c => c.trim()).filter(Boolean)
        : [];
    }
    if (b.gpa !== undefined) {
      const gpa = Number(b.gpa);
      if (b.gpa === '' || b.gpa === null) profile.gpa = null;
      else if (Number.isFinite(gpa) && gpa >= 0) profile.gpa = gpa;
    }
    if (b.gpaScale !== undefined) {
      const scale = Number(b.gpaScale);
      if ([4, 10, 100].includes(scale)) profile.gpaScale = scale;
    }
    if (b.annualFamilyIncome !== undefined) {
      const inc = Number(b.annualFamilyIncome);
      if (b.annualFamilyIncome === '' || b.annualFamilyIncome === null) profile.annualFamilyIncome = null;
      else if (Number.isFinite(inc) && inc >= 0) profile.annualFamilyIncome = inc;
    }
    if (b.state !== undefined) profile.state = String(b.state || '').trim();
    if (b.country !== undefined) profile.country = String(b.country || '').trim();
    if (b.gender !== undefined) profile.gender = String(b.gender || '').trim().toLowerCase();
    if (b.category !== undefined) profile.category = String(b.category || '').trim();
    if (b.institution !== undefined) profile.institution = String(b.institution || '').trim();

    req.user.profile = profile;
    await req.user.save();

    res.json({
      success: true,
      data: req.user.profile,
      message: 'Student profile updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

async function getSaved(req, res, next) {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedScholarships',
      match: { status: 'published' }
    }).lean();

    res.json({
      success: true,
      data: user.savedScholarships || []
    });
  } catch (err) {
    next(err);
  }
}

async function toggleSaved(req, res, next) {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    const savedSet = new Set((req.user.savedScholarships || []).map(s => String(s)));
    let isSaved = false;

    if (savedSet.has(String(id))) {
      req.user.savedScholarships = req.user.savedScholarships.filter(s => String(s) !== String(id));
      isSaved = false;
    } else {
      req.user.savedScholarships.push(scholarship._id);
      isSaved = true;
    }

    await req.user.save();

    res.json({
      success: true,
      isSaved,
      savedCount: req.user.savedScholarships.length,
      message: isSaved ? 'Scholarship saved to your shortlist.' : 'Scholarship removed from your shortlist.'
    });
  } catch (err) {
    next(err);
  }
}

async function getMyMatches(req, res, next) {
  try {
    const profile = req.user.profile || {};
    const now = new Date();

    // Query only published and non-expired scholarships
    const scholarships = await Scholarship.find({
      status: 'published',
      $or: [
        { deadline: null },
        { deadline: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } }
      ]
    }).lean();

    const studentData = {
      gpa: profile.gpa,
      gpaScale: profile.gpaScale || 10,
      educationLevel: profile.educationLevel,
      degreeLevel: profile.educationLevel,
      fieldsOfStudy: profile.courses || [],
      annualFamilyIncome: profile.annualFamilyIncome,
      state: profile.state,
      country: profile.country,
      gender: profile.gender,
      category: profile.category,
      institution: profile.institution
    };

    const matches = scholarships
      .map(s => scoreScholarship(studentData, s, now))
      .sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: {
        matches,
        studentSummary: {
          educationLevel: profile.educationLevel || 'Not set',
          gpa: profile.gpa !== null && profile.gpa !== undefined ? `${profile.gpa}/${profile.gpaScale || 10}` : 'Not set',
          annualFamilyIncome: profile.annualFamilyIncome ? `₹${profile.annualFamilyIncome.toLocaleString('en-IN')}` : 'Not set'
        },
        note: 'Guidance scores and eligibility criteria checks only; does not guarantee award selection.'
      }
    });
  } catch (err) {
    next(err);
  }
}

async function applyScholarship(req, res, next) {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);
    if (!scholarship) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    if (scholarship.status !== 'published') {
      return res.status(400).json({ success: false, message: 'This scholarship is not currently accepting applications.' });
    }

    const now = new Date();
    if (scholarship.deadline && new Date(scholarship.deadline) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      return res.status(400).json({ success: false, message: 'The application deadline for this scholarship has passed.' });
    }

    // Check if student already applied
    const existing = await Application.findOne({ scholarship: scholarship._id, student: req.user._id });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted an application for this scholarship.',
        application: existing
      });
    }

    const profile = req.user.profile || {};
    const matchScore = Number.isFinite(Number(req.body.matchScore))
      ? Math.min(100, Math.max(0, Math.round(Number(req.body.matchScore))))
      : 0;

    const application = await Application.create({
      scholarship: scholarship._id,
      student: req.user._id,
      provider: scholarship.createdBy || null,
      status: 'pending',
      matchScore,
      studentSnapshot: {
        name: req.user.name,
        email: req.user.email,
        educationLevel: profile.educationLevel || '',
        courses: profile.courses || [],
        gpa: profile.gpa ?? null,
        gpaScale: profile.gpaScale || 10,
        annualFamilyIncome: profile.annualFamilyIncome ?? null,
        state: profile.state || '',
        gender: profile.gender || '',
        category: profile.category || ''
      }
    });

    res.status(201).json({
      success: true,
      data: application,
      message: 'Application submitted successfully! The scholarship provider will review your application.'
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted an application for this scholarship.'
      });
    }
    next(err);
  }
}

async function getMyApplications(req, res, next) {
  try {
    const applications = await Application.find({ student: req.user._id })
      .populate('scholarship', 'title provider amount currency deadline status createdBy')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: applications
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getSaved,
  toggleSaved,
  getMyMatches,
  applyScholarship,
  getMyApplications
};

