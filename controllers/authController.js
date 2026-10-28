const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

async function register(req, res, next) {
  try {
    const { name, email, password, role, organization } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name or contact name is required.' });
    }

    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // STRICT TWO-ROLE ENFORCEMENT: ONLY 'student' or 'provider' allowed
    if (!['student', 'provider'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Account must be either "student" or "provider".'
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const userData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role,
      isVerified: false // Providers start as unverified
    };

    if (role === 'provider') {
      userData.organization = {
        orgName: organization?.orgName ? organization.orgName.trim() : name.trim(),
        website: organization?.website ? organization.website.trim() : '',
        description: organization?.description ? organization.description.trim() : '',
        contactEmail: organization?.contactEmail ? organization.contactEmail.toLowerCase().trim() : email.toLowerCase().trim()
      };
    }

    const user = await User.create(userData);
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      token,
      user: user.toSafeObject(),
      message: role === 'student'
        ? 'Student account created successfully!'
        : 'Provider account created successfully (Registered as Unverified Provider).'
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: user.toSafeObject(),
      message: `Welcome back, ${user.name}!`
    });
  } catch (err) {
    next(err);
  }
}

async function me(req, res, next) {
  try {
    res.json({
      success: true,
      user: req.user.toSafeObject()
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, me };
