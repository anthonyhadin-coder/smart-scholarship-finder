require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight system health check (for cloud monitors)
app.get('/health', async (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  res.status(isConnected ? 200 : 503).json({
    status: isConnected ? 'ok' : 'degraded',
    database: isConnected ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

function sanitizeError(msg) {
  if (!msg) return 'Database connection unavailable';
  return String(msg)
    .replace(/mongodb(\+srv)?:\/\/[^@]+@/g, 'mongodb+srv://[REDACTED]@')
    .replace(/(password|pwd|secret)=[^&]+/gi, '$1=[REDACTED]');
}

// Detailed API & Database status health endpoint (used by frontend Retry button)
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbName = null;
  let recordsCount = 0;
  let totalRecords = 0;
  let usersCount = 0;
  let errorReason = null;

  try {
    await connectDB();
    if (mongoose.connection.readyState === 1) {
      dbStatus = 'connected';
      dbName = mongoose.connection.name;
      const Scholarship = require('./models/Scholarship');
      const User = require('./models/User');
      const [publishedCount, totalScholarships, totalUsers] = await Promise.all([
        Scholarship.countDocuments({ status: 'published' }).catch(() => 0),
        Scholarship.countDocuments({}).catch(() => 0),
        User.countDocuments({}).catch(() => 0)
      ]);
      recordsCount = publishedCount;
      totalRecords = totalScholarships;
      usersCount = totalUsers;
    }
  } catch (err) {
    dbStatus = 'disconnected';
    errorReason = sanitizeError(err.message);
  }

  const isConnected = dbStatus === 'connected';

  res.status(isConnected ? 200 : 503).json({
    success: true,
    status: isConnected ? 'healthy' : 'degraded',
    api: 'running',
    database: {
      status: dbStatus,
      connected: isConnected,
      name: isConnected ? dbName : null,
      publishedRecordsCount: recordsCount,
      totalScholarships: totalRecords,
      totalUsers: usersCount,
      collections: ['scholarships', 'users'],
      error: !isConnected ? errorReason : undefined
    },
    message: isConnected ? 'Database connection active' : (errorReason || 'Database connection unavailable'),
    timestamp: new Date().toISOString()
  });
});

// Gateway middleware: verify database connection before handling business API routes
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[API Gateway: DB Connection Error]', err.message);
    return res.status(503).json({
      success: false,
      code: 'DB_UNAVAILABLE',
      message: 'Database connection unavailable. Please verify MONGO_URI in environment variables.'
    });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
app.use('/api/provider', require('./routes/provider'));
app.use('/api/scholarships', require('./routes/scholarships'));

app.use('/api/*path', (req, res) => res.status(404).json({ success: false, message: 'API route not found' }));

// Client-side routing fallback to public/index.html
app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(__dirname, 'public', 'index.html')) : next()));

// Global JSON error handler
app.use((err, req, res, next) => {
  console.error('[API Error]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: (err.status || 500) >= 500 ? 'Something went wrong. Please try again.' : err.message
  });
});

async function start() {
  try {
    await connectDB();
    const server = app.listen(PORT, HOST, () => console.log(`✅ Smart Scholarship Finder: http://${HOST}:${PORT}`));
    server.on('error', err => {
      console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is busy. Change PORT in .env.` : err.message);
      process.exitCode = 1;
    });
  } catch (err) {
    console.error('MongoDB connection failed on start:', err.message);
    console.error('Please check MONGO_URI in .env or cloud hosting settings.');
    process.exitCode = 1;
  }
}

if (require.main === module) start();

module.exports = app;
module.exports.app = app;
module.exports.start = start;
