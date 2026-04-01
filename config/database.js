const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('✅ Already connected to MongoDB');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds
      family: 4, // Use IPv4, skip trying IPv6
      maxPoolSize: 10, // Maintain up to 10 socket connections
    });
    
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database Name: ${conn.connection.name}`);
    
    await createIndexes();
    
    // Handle connection events
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected! Attempting to reconnect...');
      isConnected = false;
      setTimeout(connectDB, 5000);
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      isConnected = false;
    });
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    isConnected = false;
    
    // Retry connection after 5 seconds
    console.log('🔄 Retrying connection in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

async function createIndexes() {
  try {
    const db = mongoose.connection;
    
    if (db.collection('products')) {
      await db.collection('products').createIndex({ name: 'text', description: 'text' });
      await db.collection('products').createIndex({ category_id: 1 });
      await db.collection('products').createIndex({ price: 1 });
      await db.collection('products').createIndex({ featured: 1 });
      console.log('✅ Product indexes created');
    }
    
    if (db.collection('orders')) {
      await db.collection('orders').createIndex({ order_number: 1 }, { unique: true });
      await db.collection('orders').createIndex({ customer_phone: 1 });
      await db.collection('orders').createIndex({ created_at: -1 });
      console.log('✅ Order indexes created');
    }
    
    if (db.collection('categories')) {
      await db.collection('categories').createIndex({ name: 1 }, { unique: true });
      console.log('✅ Category indexes created');
    }
    
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
});

module.exports = connectDB;
