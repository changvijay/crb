const mongoose = require('mongoose');

const connectDB = async (retryCount = 0) => {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) {
    console.error('❌ MongoDB Connection Error: Neither MONGODB_URI nor MONGODB_URL is defined.');
    return null;
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: 'ShareMarketData',
      maxPoolSize: 20,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 30000, // 30s timeout to allow cold-starts over TLS
      socketTimeoutMS: 45000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Do not call process.exit(1) as it kills the container and triggers Cloud Run 500 errors
    if (retryCount < 5) {
      console.log(`🔄 Retrying MongoDB connection in 5s (attempt ${retryCount + 1}/5)...`);
      setTimeout(() => connectDB(retryCount + 1), 5000);
    }
    return null;
  }
};

module.exports = connectDB;
