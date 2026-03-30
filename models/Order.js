const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  }
});

const orderSchema = new mongoose.Schema({
  order_number: {
    type: String,
    required: true,
    unique: true
  },
  customer_name: {
    type: String,
    required: true
  },
  customer_phone: {
    type: String,
    required: true
  },
  customer_email: {
    type: String,
    required: true
  },
  items: [orderItemSchema],
  total_amount: {
    type: Number,
    required: true
  },
  payment_status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  payment_method: {
    type: String,
    enum: ['mpesa', 'cod'],
    required: true
  },
  mpesa_transaction_id: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Order', orderSchema);
