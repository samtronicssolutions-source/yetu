const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment, getAccessToken } = require('../utils/mpesa');

const router = express.Router();

// Store active connections for SSE
let activeConnections = {};

function formatPhoneNumber(phone) {
  let formatted = phone.toString().trim();
  formatted = formatted.replace(/\D/g, '');
  
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  } else if (formatted.startsWith('+254')) {
    formatted = formatted.substring(1);
  } else if (!formatted.startsWith('254')) {
    formatted = '254' + formatted;
  }
  return formatted;
}

// ============================================
// SERVER-SENT EVENTS FOR REAL-TIME PAYMENT STATUS
// ============================================
router.get('/payment-stream/:checkoutId', (req, res) => {
  const { checkoutId } = req.params;
  
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', checkoutId })}\n\n`);
  
  // Store the connection
  if (!activeConnections[checkoutId]) {
    activeConnections[checkoutId] = [];
  }
  activeConnections[checkoutId].push(res);
  
  // Remove connection when client closes
  req.on('close', () => {
    const index = activeConnections[checkoutId]?.indexOf(res);
    if (index > -1) {
      activeConnections[checkoutId].splice(index, 1);
    }
    if (activeConnections[checkoutId]?.length === 0) {
      delete activeConnections[checkoutId];
    }
  });
});

// Function to send real-time updates
function sendPaymentUpdate(checkoutId, data) {
  if (activeConnections[checkoutId]) {
    activeConnections[checkoutId].forEach(client => {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

// ============================================
// CREATE ORDER
// ============================================
router.post('/', async (req, res) => {
  try {
    console.log('\n📦 Processing order request...');
    
    const { customer_name, customer_phone, customer_email, items, payment_method } = req.body;
    
    // Validate inputs
    if (!customer_name || !customer_phone || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate stock
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Product not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
      }
    }
    
    // Calculate total
    let total = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      const price = product.price;
      total += price * item.quantity;
      
      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price: price
      });
    }
    
    // Cash on Delivery
    if (payment_method === 'cod') {
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      const order = new Order({
        order_number: orderNumber,
        customer_name,
        customer_phone,
        customer_email,
        items: orderItems,
        total_amount: total,
        payment_method,
        payment_status: 'pending',
        status: 'pending'
      });
      
      await order.save();
      
      for (const item of items) {
        await Product.findByIdAndUpdate(item.product_id, {
          $inc: { stock: -item.quantity }
        });
      }
      
      return res.json({
        success: true,
        order_number: orderNumber,
        message: 'Order created successfully. You will pay upon delivery.'
      });
    }
    
    // M-Pesa
    if (payment_method === 'mpesa') {
      const formattedPhone = formatPhoneNumber(customer_phone);
      const tempOrderNumber = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      console.log('Initiating M-Pesa payment...');
      console.log('  Phone:', formattedPhone);
      console.log('  Amount:', total);
      console.log('  Callback URL:', `${process.env.BASE_URL}/api/orders/mpesa-callback`);
      
      const mpesaResponse = await initiateMpesaPayment(formattedPhone, total, tempOrderNumber);
      
      console.log('M-Pesa Response:', JSON.stringify(mpesaResponse, null, 2));
      
      if (mpesaResponse && !mpesaResponse.error && mpesaResponse.ResponseCode === '0') {
        const checkoutId = mpesaResponse.CheckoutRequestID;
        
        // Store pending order
        const pendingOrder = {
          customer_name,
          customer_phone,
          customer_email,
          items: orderItems,
          total_amount: total,
          checkout_id: checkoutId,
          created_at: new Date()
        };
        
        if (!global.pendingOrders) global.pendingOrders = {};
        global.pendingOrders[checkoutId] = pendingOrder;
        
        console.log(`✅ M-Pesa initiated. Checkout ID: ${checkoutId}`);
        
        // Send initial waiting status via SSE
        sendPaymentUpdate(checkoutId, { 
          type: 'waiting', 
          message: 'Payment initiated. Waiting for confirmation...' 
        });
        
        // Clean up after 10 minutes
        setTimeout(() => {
          if (global.pendingOrders[checkoutId]) {
            delete global.pendingOrders[checkoutId];
            sendPaymentUpdate(checkoutId, { 
              type: 'timeout', 
              message: 'Payment timeout. Please try again.' 
            });
          }
        }, 10 * 60 * 1000);
        
        return res.json({
          success: true,
          waiting_for_payment: true,
          checkout_id: checkoutId,
          message: 'M-Pesa payment initiated. Please check your phone.'
        });
      } else {
        console.error('❌ M-Pesa initiation failed:', mpesaResponse);
        return res.status(400).json({
          success: false,
          error: 'Payment initiation failed. Please try again.'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// M-PESA CALLBACK - INSTANT ORDER CREATION
// ============================================
router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('\n📞 ========== M-PESA CALLBACK RECEIVED ==========');
    console.log('Time:', new Date().toISOString());
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    if (!data.Body || !data.Body.stkCallback) {
      console.log('⚠️ Invalid callback structure');
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback structure' });
    }
    
    const callback = data.Body.stkCallback;
    const resultCode = callback.ResultCode;
    const checkoutId = callback.CheckoutRequestID;
    const resultDesc = callback.ResultDesc;
    
    console.log(`Checkout ID: ${checkoutId}, Result: ${resultCode}, Desc: ${resultDesc}`);
    
    const pendingOrder = global.pendingOrders ? global.pendingOrders[checkoutId] : null;
    
    if (resultCode === 0 && pendingOrder) {
      // PAYMENT SUCCESSFUL - INSTANT ORDER CREATION
      console.log('✅✅✅ PAYMENT SUCCESSFUL! Creating order...');
      
      // Extract receipt
      const items = callback.CallbackMetadata?.Item || [];
      let mpesaReceipt = '';
      for (const item of items) {
        if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = item.Value;
      }
      
      // Create order immediately
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
      const order = new Order({
        order_number: orderNumber,
        customer_name: pendingOrder.customer_name,
        customer_phone: pendingOrder.customer_phone,
        customer_email: pendingOrder.customer_email,
        items: pendingOrder.items,
        total_amount: pendingOrder.total_amount,
        payment_method: 'mpesa',
        payment_status: 'completed',
        status: 'processing',
        mpesa_transaction_id: mpesaReceipt || checkoutId
      });
      
      await order.save();
      console.log(`✅ Order created: ${orderNumber}`);
      
      // Update stock
      for (const item of pendingOrder.items) {
        await Product.findByIdAndUpdate(item.product_id, {
          $inc: { stock: -item.quantity }
        });
      }
      
      // Send instant update via SSE
      sendPaymentUpdate(checkoutId, {
        type: 'success',
        order_number: orderNumber,
        message: 'Payment successful! Order confirmed.'
      });
      
      // Clean up
      delete global.pendingOrders[checkoutId];
      
    } else if (resultCode === 0 && !pendingOrder) {
      console.log(`⚠️ Payment successful but no pending order for: ${checkoutId}`);
      
      // Check if order already exists
      const existingOrder = await Order.findOne({ mpesa_transaction_id: checkoutId });
      if (existingOrder) {
        console.log(`✅ Order already exists: ${existingOrder.order_number}`);
        sendPaymentUpdate(checkoutId, {
          type: 'success',
          order_number: existingOrder.order_number,
          message: 'Payment confirmed!'
        });
      }
      
    } else {
      // PAYMENT FAILED
      console.log(`❌ PAYMENT FAILED: ${resultDesc}`);
      if (pendingOrder) {
        sendPaymentUpdate(checkoutId, {
          type: 'failed',
          message: resultDesc || 'Payment failed. Please try again.'
        });
        delete global.pendingOrders[checkoutId];
      }
    }
    
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('❌ Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error' });
  }
});

// ============================================
// POLLING FALLBACK (kept for compatibility)
// ============================================
router.get('/payment-status/:checkoutId', async (req, res) => {
  try {
    const { checkoutId } = req.params;
    
    const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
    if (order) {
      return res.json({ status: 'completed', order_number: order.order_number });
    }
    
    if (global.pendingOrders && global.pendingOrders[checkoutId]) {
      return res.json({ status: 'pending' });
    }
    
    return res.json({ status: 'unknown' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
