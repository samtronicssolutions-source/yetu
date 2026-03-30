const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');

const connectDB = require('../config/database');

const seedDatabase = async () => {
  try {
    await connectDB();
    
    console.log('🗑️  Clearing existing data...');
    await Product.deleteMany({});
    await Category.deleteMany({});
    await User.deleteMany({});
    
    console.log('📁 Creating categories...');
    // Create main categories
    const categories = [
      { name: 'Audio', parent_id: null },
      { name: 'TV', parent_id: null },
      { name: 'Accessories', parent_id: null },
      { name: 'Utensils', parent_id: null }
    ];
    
    const createdCategories = [];
    for (const cat of categories) {
      const newCat = await Category.create(cat);
      createdCategories.push(newCat);
      console.log(`  ✅ Created category: ${cat.name}`);
    }
    
    // Create subcategories
    const utensilsCategory = createdCategories.find(c => c.name === 'Utensils');
    const audioCategory = createdCategories.find(c => c.name === 'Audio');
    const accessoriesCategory = createdCategories.find(c => c.name === 'Accessories');
    
    const utensilsSubs = ['Knives', 'Cookware', 'Cutlery', 'Kitchen Tools'];
    for (const sub of utensilsSubs) {
      await Category.create({ name: sub, parent_id: utensilsCategory._id });
      console.log(`  ✅ Created subcategory: ${sub} (under Utensils)`);
    }
    
    const audioSubs = ['Headphones', 'Speakers', 'Earbuds', 'Microphones'];
    for (const sub of audioSubs) {
      await Category.create({ name: sub, parent_id: audioCategory._id });
      console.log(`  ✅ Created subcategory: ${sub} (under Audio)`);
    }
    
    console.log('📦 Creating products...');
    
    // Create products from your images
    const products = [
      {
        name: 'P64 MAX Solar Power Bank',
        description: '20,000mAh solar power bank with 4 removable cables, 2 torches, holder and string. Excellent quality, never gets swollen.',
        price: 3500,
        category_id: accessoriesCategory._id,
        image: '/images/products/p64max.jpg',
        stock: 50,
        featured: true
      },
      {
        name: 'C35 Max Speed Cable',
        description: '3X micro fast charging cable with max speed technology. Fast and safe 3A charging.',
        price: 450,
        category_id: accessoriesCategory._id,
        image: '/images/products/c35.jpg',
        stock: 100,
        featured: true
      },
      {
        name: 'E4 Metal Extra Bass Headset',
        description: '4X extra bass headset with metal build. 1.2M long wire, 3.5mm and Type-C compatible. Excellent quality sound.',
        price: 1200,
        category_id: audioCategory._id,
        image: '/images/products/e4.jpg',
        stock: 75,
        featured: true
      },
      {
        name: 'T10 True Wireless Earbuds',
        description: 'Extra bass true wireless earbuds. Comfortable to wear, lightweight design with smart touch controls.',
        price: 2500,
        category_id: audioCategory._id,
        image: '/images/products/t10.jpg',
        stock: 60,
        featured: true
      },
      {
        name: 'T9 OWS Wireless Earphones',
        description: 'Open wireless earphones with comfortable fit. Smart touch controls and low latency.',
        price: 2800,
        category_id: audioCategory._id,
        image: '/images/products/t9ows.jpg',
        stock: 45,
        featured: true
      },
      {
        name: '65W Fast Charger with Retractable Cable',
        description: '3-in-1 cable charger with 65W super charging. 65cm retractable cable, smart chip inside.',
        price: 3200,
        category_id: accessoriesCategory._id,
        image: '/images/products/ch3.jpg',
        stock: 40,
        featured: true
      },
      {
        name: '4-in-1 Charger Kit',
        description: 'One cable with four connectors: Type-C, Micro, and USB. Fast charging with indicator light.',
        price: 1500,
        category_id: accessoriesCategory._id,
        image: '/images/products/ch4.jpg',
        stock: 80,
        featured: false
      },
      {
        name: '25W PD Fast Adapter',
        description: 'Type-C fast charging adapter with PD technology. Compact and efficient.',
        price: 1200,
        category_id: accessoriesCategory._id,
        image: '/images/products/ad1.jpg',
        stock: 100,
        featured: false
      },
      {
        name: 'Professional Hair Dryer',
        description: '3000W professional hair dryer with multiple heat settings. Perfect for salon or home use.',
        price: 3500,
        category_id: accessoriesCategory._id,
        image: '/images/products/hairdryer.jpg',
        stock: 30,
        featured: false
      },
      {
        name: 'Premium Kitchen Knife Set',
        description: 'High-quality stainless steel knife set with ergonomic handles. Includes chef knife, paring knife, and bread knife.',
        price: 4500,
        category_id: utensilsCategory._id,
        image: '/images/products/knives.jpg',
        stock: 25,
        featured: true
      },
      {
        name: 'Professional Audio Amplifier',
        description: 'Hi-Fi stereo audio amplifier with Bluetooth, USB/SD support. Professional sound quality.',
        price: 8500,
        category_id: audioCategory._id,
        image: '/images/products/amplifier.jpg',
        stock: 15,
        featured: true
      },
      {
        name: 'Wireless Speaker System',
        description: 'High power wireless speaker with flashing lights. Safety battery and great sound quality.',
        price: 5500,
        category_id: audioCategory._id,
        image: '/images/products/speaker.jpg',
        stock: 20,
        featured: true
      }
    ];
    
    for (const product of products) {
      await Product.create(product);
      console.log(`  ✅ Created product: ${product.name} - KSh ${product.price}`);
    }
    
    console.log('👤 Creating admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({
      username: 'admin',
      password: hashedPassword,
      email: 'admin@yetu.com',
      role: 'admin'
    });
    
    console.log('\n✅ Database seeded successfully!');
    console.log('📊 Statistics:');
    console.log(`   - Categories: ${await Category.countDocuments()}`);
    console.log(`   - Products: ${await Product.countDocuments()}`);
    console.log(`   - Admin User: 1`);
    console.log('\n🔑 Admin Login:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('\n🚀 Your e-commerce site is ready!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
