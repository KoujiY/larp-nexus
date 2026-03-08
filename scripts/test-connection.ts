import mongoose from 'mongoose';
import { config } from 'dotenv';
import { resolve } from 'path';
import connectDB from '../lib/db/mongodb';

// 載入 .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function testConnection() {
  try {
    console.log('🔍 檢查環境變數...');
    console.log('📁 .env.local 路徑:', resolve(process.cwd(), '.env.local'));
    
    if (!process.env.MONGODB_URI) {
      console.error('❌ 找不到 MONGODB_URI 環境變數');
      console.error('');
      console.error('請確認：');
      console.error('1. .env.local 檔案存在於專案根目錄');
      console.error('2. 檔案中包含 MONGODB_URI=...');
      console.error('3. 變數名稱拼寫正確（區分大小寫）');
      process.exit(1);
    }
    
    console.log('✅ MONGODB_URI 已設定');
    console.log('🔗 連線到:', process.env.MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));
    console.log('');
    
    console.log('🔄 正在連線到 MongoDB...');
    console.log('');
    
    await connectDB();
    
    console.log('✅ MongoDB 連線成功！');
    
    const db = mongoose.connection.db;
    if (!db) {
      console.error('❌ 資料庫連線物件不存在');
      process.exit(1);
    }
    
    console.log('📦 資料庫名稱:', db.databaseName);
    console.log('🌐 連線狀態:', mongoose.connection.readyState === 1 ? '已連線' : '未連線');
    console.log('');
    
    // 列出所有 collections
    const collections = await db.listCollections().toArray();
    console.log('📚 現有 Collections:');
    if (collections.length === 0) {
      console.log('  (尚無 collections，這是正常的)');
    } else {
      collections.forEach(col => {
        console.log(`  - ${col.name}`);
      });
    }
    
    await mongoose.disconnect();
    console.log('');
    console.log('👋 已斷線');
    process.exit(0);
  } catch (error) {
    console.error('❌ 連線失敗:', error);
    process.exit(1);
  }
}

testConnection();

