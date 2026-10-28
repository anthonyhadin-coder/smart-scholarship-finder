const mongoose = require('mongoose');

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

module.exports = async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart_scholarship';

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      bufferCommands: false,
    }).then((m) => {
      console.log(`🟢 MongoDB connected: ${m.connection.host}/${m.connection.name}`);
      return m.connection;
    }).catch((err) => {
      cached.promise = null;
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
};
