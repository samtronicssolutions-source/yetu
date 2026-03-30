const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
  console.log('🔌 Testing MongoDB connection...');
  console.log(`📡 Connection string: ${process.env.MONGODB_URI.replace(/kasengesi001/, '******')}`);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected successfully to MongoDB Atlas!');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);
    
    await mongoose.disconnect();
    console.log('✅ Connection test completed!');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testConnection();
