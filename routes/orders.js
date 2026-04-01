const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment, getAccessToken } = require('../utils/mpesa');

const router = express.Router();

// ============================================
// HELPER FUNCTION - FORMAT PHONE NUMBER
// ============================================
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
// TEST ENDPOINT - Check M-Pesa Credentials
// ============================================
router.get('/test-mpesa', async (req, res) => {
  try {
    console.log('🧪 Testing M-Pesa credentials...');
    
    const token = await getAccessToken();
    
    if (!token) {
      return res.json({ 
        success: false, 
        step: 'access_token',
        message: 'Failed to get access token. Check your MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET' 
      });
    }
    
    const testPhone = '254708374149';
    const testAmount = 10;
    const testOrder = `TEST-${Date.now()}`;
    
    const result = await initiateMpesaPayment(testPhone, testAmount, testOrder);
    
    if (!result) {
      return res.json({ 
        success: false, 
        step: 'stk_push',
        message: 'STK push returned null' 
      });
    }
    
    if (result.error) {
      return res.json({ 
        success: false, 
        step: 'stk_push',
        error: result,
        message: result.message || 'STK push failed' 
      });
    }
    
    res.json({
      success: true,
      message: 'M-Pesa credentials are working!',
      details: {
        access_token_received: true,
        stk_response: {
          ResponseCode: result.ResponseCode,
          ResponseDescription: result.ResponseDescription,
          CheckoutRequestID: result.CheckoutRequestID
        }
      }
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// CHECK ENVIRONMENT VARIABLES
// ============================================
router.get('/check-env', (req, res) => {
  res.json({
    mpesa_consumer_key_exists: !!process.env.MPESA_CONSUMER_KEY,
    mpesa_consumer_key_length: process.env.MPESA_CONSUMER_KEY?.length || 0,
    mpesa_consumer_secret_exists: !!process.env.MPESA_CONSUMER_SECRET,
    mpesa_consumer_secret_length: process.env.MPESA_CONSUMER_SECRET?.length || 0,
    mpesa_shortcode: process.env.MPESA_SHORTCODE,
    base_url: process.env.BASE_URL,
    node_env: process.env.NODE_ENV
  });
});

// ============================================
// CREATE ORDER
// ============================================
router.post('/', async (req, res) => {
  try {
    console.log('\n📦 Creating new order...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
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
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // Create order
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
    console.log('✅ Order created:', orderNumber);
    
    // Update stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { stock: -item.quantity }
      });
    }
    
    // Process M-Pesa payment if selected
    if (payment_method === 'mpesa') {
      const formattedPhone = formatPhoneNumber(customer_phone);
      console.log('Processing M-Pesa for phone:', formattedPhone);
      console.log('Amount:', total);
      console.log('Order Number:', orderNumber);
      
      const mpesaResponse = await initiateMpesaPayment(formattedPhone, total, orderNumber);
      
      console.log('M-Pesa Response:', JSON.stringify(mpesaResponse, null, 2));
      
      if (mpesaResponse && !mpesaResponse.error && mpesaResponse.ResponseCode === '0') {
        // CRITICAL: Save the checkout ID to mpesa_transaction_id for callback matching
        order.mpesa_transaction_id = mpesaResponse.CheckoutRequestID;
        await order.save();
        
        console.log(`✅ M-Pesa initiated - Checkout ID: ${mpesaResponse.CheckoutRequestID}`);
        
        return res.json({
          success: true,
          order_number: orderNumber,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated. Please check your phone to complete payment.'
        });
      } else {
        // M-Pesa initiation failed
        const errorMsg = mpesaResponse?.message || mpesaResponse?.ResponseDescription || 'Payment initiation failed';
        console.error('❌ M-Pesa initiation failed:', errorMsg);
        
        return res.json({
          success: true,
          order_number: orderNumber,
          payment_initiated: false,
          message: `Order created but payment failed: ${errorMsg}. Please try Cash on Delivery or try again.`
        });
      }
    }
    
    // Cash on delivery
    res.json({
      success: true,
      order_number: orderNumber,
      message: 'Order created successfully. You will pay upon delivery.'
    });
    
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET ORDER BY NUMBER
// ============================================
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

// ============================================
// M-PESA CALLBACK - CRITICAL FOR PAYMENT STATUS
// ============================================
router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('\n📞 ========== M-PESA CALLBACK RECEIVED ==========');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Full Callback Data:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    // Validate callback structure
    if (!data.Body || !data.Body.stkCallback) {
      console.log('⚠️ Invalid callback structure - missing stkCallback');
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback structure' });
    }
    
    const callback = data.Body.stkCallback;
    const resultCode = callback.ResultCode;
    const checkoutId = callback.CheckoutRequestID;
    const resultDesc = callback.ResultDesc;
    
    console.log(`\n📋 Callback Details:`);
    console.log(`  Checkout ID: ${checkoutId}`);
    console.log(`  Result Code: ${resultCode}`);
    console.log(`  Result Description: ${resultDesc}`);
    
    // Find order by the checkout ID stored during payment initiation
    const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
    
    if (!order) {
      console.log(`❌ Order NOT found for checkout ID: ${checkoutId}`);
      console.log(`Tip: Make sure order.mpesa_transaction_id is set when initiating payment`);
      return res.json({ ResultCode: 1, ResultDesc: 'Order not found' });
    }
    
    console.log(`✅ Found order: ${order.order_number}`);
    console.log(`Current order status:`);
    console.log(`  Payment Status: ${order.payment_status}`);
    console.log(`  Order Status: ${order.status}`);
    console.log(`  Total Amount: ${order.total_amount}`);
    
    if (resultCode === 0) {
      // PAYMENT SUCCESSFUL
      const items = callback.CallbackMetadata?.Item || [];
      let mpesaReceipt = '';
      let amount = 0;
      let phone = '';
      
      console.log(`\n💰 Payment Metadata:`);
      for (const item of items) {
        console.log(`  ${item.Name}: ${item.Value}`);
        if (item.Name === 'MpesaReceiptNumber') {
          mpesaReceipt = item.Value;
        }
        if (item.Name === 'Amount') {
          amount = item.Value;
        }
        if (item.Name === 'PhoneNumber') {
          phone = item.Value;
        }
      }
      
      // Update order to completed
      order.payment_status = 'completed';
      order.status = 'processing';
      order.mpesa_transaction_id = mpesaReceipt; // Store receipt number
      
      await order.save();
      
      console.log(`\n✅ PAYMENT SUCCESSFUL!`);
      console.log(`  Order: ${order.order_number}`);
      console.log(`  Receipt: ${mpesaReceipt}`);
      console.log(`  Amount: ${amount}`);
      console.log(`  Phone: ${phone}`);
      console.log(`  Updated status: payment=${order.payment_status}, order=${order.status}`);
      
    } else {
      // PAYMENT FAILED
      console.log(`\n❌ PAYMENT FAILED: ${resultDesc}`);
      
      order.payment_status = 'failed';
      order.status = 'cancelled';
      
      // Restore stock for failed payment
      console.log(`\n🔄 Restoring stock for order items:`);
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product_id, {
          $inc: { stock: item.quantity }
        });
        console.log(`  Restored ${item.quantity} units of product: ${item.product_id}`);
      }
      
      await order.save();
      console.log(`  Updated status: payment=${order.payment_status}, order=${order.status}`);
    }
    
    console.log('\n========== CALLBACK PROCESSED SUCCESSFULLY ==========\n');
    
    // Always respond with success to M-Pesa
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
});

// ============================================
// MANUAL ORDER STATUS UPDATE (Admin Only - For Testing)
// ============================================
router.post('/manual-update/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { payment_status, status } = req.body;
    
    const order = await Order.findOne({ order_number: orderNumber });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    console.log(`📝 Manually updating order: ${orderNumber}`);
    console.log(`  Old payment_status: ${order.payment_status}`);
    console.log(`  New payment_status: ${payment_status || order.payment_status}`);
    console.log(`  Old status: ${order.status}`);
    console.log(`  New status: ${status || order.status}`);
    
    if (payment_status) order.payment_status = payment_status;
    if (status) order.status = status;
    
    await order.save();
    
    res.json({
      success: true,
      order: {
        order_number: order.order_number,
        payment_status: order.payment_status,
        status: order.status
      }
    });
  } catch (error) {
    console.error('Manual update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET ALL ORDERS (Admin Only)
// ============================================
router.get('/admin/all', async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ created_at: -1 })
      .populate('items.product_id');
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
