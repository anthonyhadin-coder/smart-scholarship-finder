const mongoose = require('mongoose');
const Scholarship = require('../models/Scholarship');
const { scoreScholarship } = require('../utils/matchScorer');

const escapeRegex = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function list(req, res, next) {
  try {
    const {
      search = '',
      degreeLevel = '',
      field = '',
      tag = '',
      sort = 'deadline',
      page = '1'
    } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only published and non-expired scholarships in public discovery
    const filter = {
      status: 'published',
      $or: [
        { deadline: null },
        { deadline: { $gte: today } }
      ]
    };

    if (search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim().slice(0, 80)), 'i');
      filter.$and = [
        {
          $or: [
            { title: rx },
            { provider: rx },
            { description: rx },
            { tags: rx },
            { fieldsOfStudy: rx }
          ]
        }
      ];
    }

    if (degreeLevel) filter.degreeLevels = degreeLevel;
    if (field) filter.fieldsOfStudy = new RegExp(escapeRegex(field.slice(0, 80)), 'i');
    if (tag) filter.tags = tag.toLowerCase();

    const p = Math.max(1, Math.min(1000, parseInt(page, 10) || 1));
    const sortBy = sort === 'amount'
      ? { amount: -1 }
      : sort === 'title'
      ? { title: 1 }
      : { deadline: 1 };

    const [data, total] = await Promise.all([
      Scholarship.find(filter).sort(sortBy).skip((p - 1) * 12).limit(12).lean(),
      Scholarship.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        page: p,
        limit: 12,
        total,
        pages: Math.ceil(total / 12)
      },
      isEmpty: total === 0
    });
  } catch (e) {
    next(e);
  }
}

async function getById(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid scholarship ID.' });
    }

    const data = await Scholarship.findById(req.params.id).lean();
    if (!data) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    // If draft or closed, only allow creator to view
    if (data.status !== 'published') {
      const userId = req.user?._id ? String(req.user._id) : null;
      if (!userId || String(data.createdBy) !== userId) {
        return res.status(404).json({ success: false, message: 'Scholarship is currently not published.' });
      }
    }

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

async function summary(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeFilter = {
      status: 'published',
      $or: [
        { deadline: null },
        { deadline: { $gte: today } }
      ]
    };

    const in30Days = new Date(Date.now() + 30 * 86400000);

    const [total, closingSoon, agg] = await Promise.all([
      Scholarship.countDocuments(activeFilter),
      Scholarship.countDocuments({
        ...activeFilter,
        deadline: { $gte: today, $lte: in30Days }
      }),
      Scholarship.aggregate([
        { $match: activeFilter },
        { $group: { _id: null, amount: { $sum: '$amount' } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        total,
        closingSoon,
        listedAwardValue: agg[0]?.amount || 0
      }
    });
  } catch (e) {
    next(e);
  }
}

async function match(req, res, next) {
  try {
    const b = req.body || {};
    const gpa = Number(b.gpa);
    const scale = Number(b.gpaScale || 10);

    if (b.gpa !== undefined && b.gpa !== '' && b.gpa !== null) {
      if (!Number.isFinite(gpa) || !Number.isFinite(scale) || ![4, 10, 100].includes(scale) || gpa < 0 || gpa > scale) {
        return res.status(400).json({ success: false, message: 'Enter a valid GPA within a 4, 10, or 100 point scale.' });
      }
    }

    const split = v => Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean)
      : typeof v === 'string'
      ? v.split(',').map(x => x.trim()).filter(Boolean)
      : [];

    const student = {
      gpa: b.gpa !== undefined && b.gpa !== '' && b.gpa !== null ? gpa : null,
      gpaScale: scale,
      degreeLevel: b.degreeLevel || b.educationLevel || '',
      educationLevel: b.degreeLevel || b.educationLevel || '',
      fieldsOfStudy: split(b.fieldsOfStudy || b.courses),
      annualFamilyIncome: b.annualFamilyIncome ? Number(b.annualFamilyIncome) : null,
      citizenship: String(b.citizenship || b.country || ''),
      state: String(b.state || b.location || ''),
      gender: String(b.gender || '').toLowerCase(),
      category: String(b.category || ''),
      institution: String(b.institution || ''),
      tags: split(b.tags),
      minAmount: Number(b.minAmount) || 0
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only match against published, non-expired scholarships
    const docs = await Scholarship.find({
      status: 'published',
      $or: [
        { deadline: null },
        { deadline: { $gte: today } }
      ]
    }).lean();

    const matches = docs.map(s => scoreScholarship(student, s, today)).sort((a, b) => b.score - a.score);

    res.json({
      success: true,
      data: {
        matches,
        note: 'Guidance scores and eligibility criteria checks only; not an award probability or guarantee.'
      }
    });
  } catch (e) {
    next(e);
  }
}

module.exports = { list, getById, summary, match };
