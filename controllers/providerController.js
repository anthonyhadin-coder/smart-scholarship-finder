const Scholarship = require('../models/Scholarship');

async function getProfile(req, res, next) {
  try {
    res.json({
      success: true,
      data: {
        organization: req.user.organization || {},
        isVerified: req.user.isVerified || false,
        name: req.user.name,
        email: req.user.email
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    const { orgName, website, description, contactEmail } = req.body || {};
    const org = req.user.organization || {};

    if (orgName !== undefined) org.orgName = String(orgName).trim();
    if (website !== undefined) org.website = String(website).trim();
    if (description !== undefined) org.description = String(description).trim();
    if (contactEmail !== undefined) org.contactEmail = String(contactEmail).toLowerCase().trim();

    req.user.organization = org;
    await req.user.save();

    res.json({
      success: true,
      data: req.user.organization,
      message: 'Organization profile updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

async function getMyScholarships(req, res, next) {
  try {
    // Return ONLY scholarships created by this authenticated provider
    const scholarships = await Scholarship.find({ createdBy: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: scholarships,
      providerInfo: {
        isVerified: req.user.isVerified || false,
        orgName: req.user.organization?.orgName || req.user.name
      }
    });
  } catch (err) {
    next(err);
  }
}

async function createScholarship(req, res, next) {
  try {
    const b = req.body || {};

    for (const field of ['title', 'description']) {
      if (!String(b[field] || '').trim()) {
        return res.status(400).json({ success: false, message: `${field} is required.` });
      }
    }

    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a non-negative number.' });
    }

    const split = v => Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean)
      : typeof v === 'string'
      ? v.split(',').map(x => x.trim()).filter(Boolean)
      : [];

    const status = ['draft', 'published', 'closed'].includes(b.status) ? b.status : 'published';

    // Provider name defaults to orgName or user name
    const providerName = req.user.organization?.orgName || req.user.name;

    const scholarship = await Scholarship.create({
      title: String(b.title).trim(),
      provider: providerName,
      description: String(b.description).trim(),
      amount,
      currency: ['INR', 'USD', 'GBP', 'EUR'].includes(b.currency) ? b.currency : 'INR',
      deadline: b.deadline ? new Date(b.deadline) : null,
      degreeLevels: split(b.degreeLevels),
      fieldsOfStudy: split(b.fieldsOfStudy),
      minGPA: Number(b.minGPA) || 0,
      gpaScale: [4, 10, 100].includes(Number(b.gpaScale)) ? Number(b.gpaScale) : 10,
      maxIncome: b.maxIncome && Number(b.maxIncome) > 0 ? Number(b.maxIncome) : null,
      locations: split(b.locations),
      genderRestriction: ['all', 'female', 'male', 'other'].includes(b.genderRestriction) ? b.genderRestriction : 'all',
      categoryRestriction: split(b.categoryRestriction),
      institutionRestriction: split(b.institutionRestriction),
      citizenship: split(b.citizenship),
      tags: split(b.tags).map(t => t.toLowerCase()),
      applicationUrl: String(b.applicationUrl || '').trim(),
      requiredDocuments: split(b.requiredDocuments || ['Academic transcript']),
      status,
      // CRITICAL: Bind ownership to authenticated provider only
      createdBy: req.user._id,
      providerVerified: Boolean(req.user.isVerified),
      isDemo: false
    });

    res.status(201).json({
      success: true,
      data: scholarship,
      message: status === 'published'
        ? 'Scholarship published successfully!'
        : 'Scholarship saved as draft.'
    });
  } catch (err) {
    next(err);
  }
}

async function updateScholarship(req, res, next) {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);

    if (!scholarship) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    // STRICT OWNERSHIP CHECK: Provider A cannot modify Provider B's scholarship
    if (!scholarship.createdBy || String(scholarship.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. You can only edit scholarships that your organization created.'
      });
    }

    const b = req.body || {};
    const split = v => Array.isArray(v)
      ? v.map(x => String(x).trim()).filter(Boolean)
      : typeof v === 'string'
      ? v.split(',').map(x => x.trim()).filter(Boolean)
      : [];

    if (b.title !== undefined) scholarship.title = String(b.title).trim();
    if (b.description !== undefined) scholarship.description = String(b.description).trim();
    if (b.amount !== undefined) scholarship.amount = Number(b.amount) || 0;
    if (b.currency !== undefined && ['INR', 'USD', 'GBP', 'EUR'].includes(b.currency)) scholarship.currency = b.currency;
    if (b.deadline !== undefined) scholarship.deadline = b.deadline ? new Date(b.deadline) : null;
    if (b.degreeLevels !== undefined) scholarship.degreeLevels = split(b.degreeLevels);
    if (b.fieldsOfStudy !== undefined) scholarship.fieldsOfStudy = split(b.fieldsOfStudy);
    if (b.minGPA !== undefined) scholarship.minGPA = Number(b.minGPA) || 0;
    if (b.gpaScale !== undefined && [4, 10, 100].includes(Number(b.gpaScale))) scholarship.gpaScale = Number(b.gpaScale);
    if (b.maxIncome !== undefined) scholarship.maxIncome = b.maxIncome && Number(b.maxIncome) > 0 ? Number(b.maxIncome) : null;
    if (b.locations !== undefined) scholarship.locations = split(b.locations);
    if (b.genderRestriction !== undefined) scholarship.genderRestriction = b.genderRestriction;
    if (b.categoryRestriction !== undefined) scholarship.categoryRestriction = split(b.categoryRestriction);
    if (b.institutionRestriction !== undefined) scholarship.institutionRestriction = split(b.institutionRestriction);
    if (b.citizenship !== undefined) scholarship.citizenship = split(b.citizenship);
    if (b.tags !== undefined) scholarship.tags = split(b.tags).map(t => t.toLowerCase());
    if (b.applicationUrl !== undefined) scholarship.applicationUrl = String(b.applicationUrl).trim();
    if (b.requiredDocuments !== undefined) scholarship.requiredDocuments = split(b.requiredDocuments);
    if (b.status !== undefined && ['draft', 'published', 'closed'].includes(b.status)) scholarship.status = b.status;

    // Refresh provider name from current organization
    if (req.user.organization?.orgName) {
      scholarship.provider = req.user.organization.orgName;
    }
    scholarship.providerVerified = Boolean(req.user.isVerified);

    await scholarship.save();

    res.json({
      success: true,
      data: scholarship,
      message: 'Scholarship updated successfully.'
    });
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!['draft', 'published', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be draft, published, or closed.' });
    }

    const scholarship = await Scholarship.findById(id);
    if (!scholarship) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    // STRICT OWNERSHIP CHECK
    if (!scholarship.createdBy || String(scholarship.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. You can only modify scholarships created by your organization.'
      });
    }

    scholarship.status = status;
    await scholarship.save();

    res.json({
      success: true,
      data: scholarship,
      message: `Scholarship status changed to ${status}.`
    });
  } catch (err) {
    next(err);
  }
}

async function deleteScholarship(req, res, next) {
  try {
    const { id } = req.params;
    const scholarship = await Scholarship.findById(id);

    if (!scholarship) {
      return res.status(404).json({ success: false, message: 'Scholarship not found.' });
    }

    // STRICT OWNERSHIP CHECK
    if (!scholarship.createdBy || String(scholarship.createdBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied. You can only delete scholarships created by your organization.'
      });
    }

    await Scholarship.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Scholarship listing deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getMyScholarships,
  createScholarship,
  updateScholarship,
  updateStatus,
  deleteScholarship
};

