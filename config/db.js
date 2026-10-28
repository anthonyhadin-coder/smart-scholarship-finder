const mongoose = require('mongoose');

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

function getMongoUri() {
  // Support MONGO_URI as primary, and MONGODB_URI as documented alternative
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (uri && uri.trim()) {
    return uri.trim();
  }

  // Never fall back to localhost/127.0.0.1 in cloud/production environments
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  if (isProduction) {
    throw new Error('MONGO_URI is not configured in production environment variables.');
  }

  // Local development fallback
  return 'mongodb://127.0.0.1:27017/smart_scholarship';
}

module.exports = async function connectDB() {
  // Return active connection if ready
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const uri = getMongoUri();

  // If disconnected or no active promise, initiate connection
  if (!cached.promise || mongoose.connection.readyState === 0) {
    cached.promise = mongoose.connect(uri, {
      dbName: 'smart_scholarship', // Always target the intended database
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false, // Fail fast rather than holding queries on disconnect
    }).then((m) => {
      // Safe logging: log host and database name only, never credentials or full URI
      console.log(`🟢 MongoDB connected: ${m.connection.host}/${m.connection.name}`);
      return m.connection;
    }).catch((err) => {
      cached.promise = null;
      cached.conn = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    cached.conn = null;
    throw err;
  }

  return cached.conn;
};
