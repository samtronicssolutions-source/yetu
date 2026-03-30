const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Product = require('../models/Product');
const Category = require('../models/Category');
const connectDB = require('../config/database');

const products = [
  { name: 'P64 MAX Solar Power Bank', description: '20,000mAh solar power bank with 4 removable cables, 2 torches, holder and string. Excellent quality, never gets swollen.', price: 3500, image: '/images/products/p64max.jpg', stock: 50, featured: true },
  { name: 'C35 Max Speed Cable', description: '3X micro fast charging cable with max speed technology. Fast and safe 3A charging.', price: 450, image: '/images/products/c35.jpg', stock: 100, featured: true },
  { name: 'E4 Metal Extra Bass Headset', description: '4X extra bass headset with metal build. 1.2M long wire, 3.5mm and Type-C compatible. Excellent quality sound.', price: 1200, image: '/images/products/e4.jpg', stock: 75, featured: true },
  { name: 'T10 True Wireless Earbuds', description: 'Extra bass true wireless earbuds. Comfortable to wear, lightweight design with smart touch controls.', price: 2500, image: '/images/products/t10.jpg', stock: 60, featured: true },
  { name: 'T9 OWS Wireless Earphones', description: 'Open wireless earphones with comfortable fit. Smart touch controls and low latency.', price: 2800, image: '/images/products/t9ows.jpg', stock: 45
