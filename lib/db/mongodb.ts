import mongoose from 'mongoose';

type MongooseConnection = typeof mongoose;

declare global {
  // 避免在開發模式下重複連線
  var mongoose: {
    conn: MongooseConnection | null;
    promise: Promise<MongooseConnection> | null;
  };
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // 在函式執行時才檢查環境變數
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    throw new Error('請在 .env.local 中設定 MONGODB_URI');
  }
  
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((conn) => {
      console.info('[MongoDB] Connected successfully');
      return conn;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('❌ MongoDB 連線失敗:', e);
    throw e;
  }

  return cached.conn;
}

export default connectDB;

