const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment } = require('../utils/mpesa');

const router = express.Router();

// Create order
router.post('/', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_email, items, payment_method } = req.body;
    
    // Validate stock
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product?.name}` });
      }
    }
    
    // Calculate total
    let total = 0;
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      item.price = product.price;
      total += product.price * item.quantity;
    }
    
    // Create order
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
    const order = new Order({
      order_number: orderNumber,
      customer_name,
      customer_phone,
      customer_email,
      items,
      total_amount: total,
      payment_method
    });
    
    await order.save();
    
    // Update stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { stock: -item.quantity }
      });
    }
    
    // Process M-Pesa payment if selected
    if (payment_method === 'mpesa') {
      const mpesaResponse = await initiateMpesaPayment(customer_phone, total, orderNumber);
      if (mpesaResponse && mpesaResponse.ResponseCode === '0') {
        return res.json({
          success: true,
          order_number: orderNumber,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated'
        });
      }
    }
    
    res.json({
      success: true,
      order_number: orderNumber,
      message: 'Order created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by number
router.get('/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ order_number: req.params.orderNumber })
      .populate('items.product_id');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// M-Pesa callback
router.post('/mpesa-callback', async (req, res) => {
  try {
    const data = req.body;
    
    if (data.Body && data.Body.stkCallback) {
      const callback = data.Body.stkCallback;
      const resultCode = callback.ResultCode;
      const checkoutId = callback.CheckoutRequestID;
      
      if (resultCode === 0) {
        // Payment successful
        const items = callback.CallbackMetadata.Item;
        let mpesaReceipt = '';
        
        for (const item of items) {
          if (item.Name === 'MpesaReceiptNumber') {
            mpesaReceipt = item.Value;
            break;
          }
        }
        
        // Update order
        const order = await Order.findOne({ order_number: checkoutId });
        if (order) {
          order.payment_status = 'completed';
          order.mpesa_transaction_id = mpesaReceipt;
          order.status = 'processing';
          await order.save();
        }
      } else {
        // Payment failed
        const order = await Order.findOne({ order_number: checkoutId });
        if (order) {
          order.payment_status = 'failed';
          await order.save();
        }
      }
    }
    
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error' });
  }
});

module.exports = router;
