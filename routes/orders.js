const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment, getAccessToken } = require('../utils/mpesa');

const router = express.Router();

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
// CREATE ORDER - WAIT FOR PAYMENT CONFIRMATION
// ============================================
router.post('/', async (req, res) => {
  try {
    console.log('\n📦 Processing order request...');
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
    
    // Generate temporary order number
    const tempOrderNumber = `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // For Cash on Delivery - create order immediately
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
      
      // Update stock
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
    
    // For M-Pesa - initiate payment first, then create order after confirmation
    if (payment_method === 'mpesa') {
      const formattedPhone = formatPhoneNumber(customer_phone);
      console.log('Initiating M-Pesa payment for phone:', formattedPhone);
      console.log('Amount:', total);
      
      const mpesaResponse = await initiateMpesaPayment(formattedPhone, total, tempOrderNumber);
      
      console.log('M-Pesa Response:', JSON.stringify(mpesaResponse, null, 2));
      
      if (mpesaResponse && !mpesaResponse.error && mpesaResponse.ResponseCode === '0') {
        // Store pending order data temporarily (could use Redis or in-memory)
        // For now, store in a temporary collection or use a simple object
        const pendingOrder = {
          tempOrderNumber,
          customer_name,
          customer_phone,
          customer_email,
          items: orderItems,
          total_amount: total,
          checkout_id: mpesaResponse.CheckoutRequestID,
          created_at: new Date()
        };
        
        // Store in a temporary collection or use global variable
        // For production, use Redis or a database collection
        if (!global.pendingOrders) global.pendingOrders = {};
        global.pendingOrders[mpesaResponse.CheckoutRequestID] = pendingOrder;
        
        // Set timeout to clean up if payment fails (10 minutes)
        setTimeout(() => {
          if (global.pendingOrders[mpesaResponse.CheckoutRequestID]) {
            delete global.pendingOrders[mpesaResponse.CheckoutRequestID];
            console.log(`⏰ Cleaned up pending order: ${mpesaResponse.CheckoutRequestID}`);
          }
        }, 10 * 60 * 1000);
        
        console.log(`✅ M-Pesa initiated. Waiting for payment confirmation...`);
        
        return res.json({
          success: true,
          waiting_for_payment: true,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated. Please check your phone and enter PIN to complete payment.'
        });
      } else {
        console.error('❌ M-Pesa initiation failed:', mpesaResponse);
        return res.status(400).json({
          success: false,
          error: 'Payment initiation failed. Please try again or choose Cash on Delivery.'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHECK PAYMENT STATUS
// ============================================
router.get('/payment-status/:checkoutId', async (req, res) => {
  try {
    const { checkoutId } = req.params;
    
    // Check if order was already created (successful payment)
    const existingOrder = await Order.findOne({ mpesa_transaction_id: checkoutId });
    if (existingOrder) {
      return res.json({
        success: true,
        status: 'completed',
        order_number: existingOrder.order_number,
        message: 'Payment successful! Order created.'
      });
    }
    
    // Check pending order
    if (global.pendingOrders && global.pendingOrders[checkoutId]) {
      return res.json({
        success: true,
        status: 'pending',
        message: 'Payment pending. Please complete payment on your phone.'
      });
    }
    
    // Check if payment failed (callback would have cleaned up)
    if (global.failedPayments && global.failedPayments[checkoutId]) {
      return res.json({
        success: false,
        status: 'failed',
        message: 'Payment failed. Please try again.'
      });
    }
    
    return res.json({
      success: false,
      status: 'unknown',
      message: 'Payment status unknown. Please contact support.'
    });
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// M-PESA CALLBACK - CREATE ORDER ON SUCCESSFUL PAYMENT
// ============================================
router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('\n📞 ========== M-PESA CALLBACK RECEIVED ==========');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Callback Data:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    if (!data.Body || !data.Body.stkCallback) {
      console.log('⚠️ Invalid callback structure');
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback structure' });
    }
    
    const callback = data.Body.stkCallback;
    const resultCode = callback.ResultCode;
    const checkoutId = callback.CheckoutRequestID;
    const resultDesc = callback.ResultDesc;
    
    console.log(`Callback Details:`);
    console.log(`  Checkout ID: ${checkoutId}`);
    console.log(`  Result Code: ${resultCode}`);
    console.log(`  Result Desc: ${resultDesc}`);
    
    // Check if this is a pending order waiting for confirmation
    const pendingOrder = global.pendingOrders ? global.pendingOrders[checkoutId] : null;
    
    if (resultCode === 0) {
      // PAYMENT SUCCESSFUL - Create the actual order
      if (pendingOrder) {
        console.log('✅ Payment successful! Creating order...');
        
        // Extract payment metadata
        const items = callback.CallbackMetadata?.Item || [];
        let mpesaReceipt = '';
        let amount = 0;
        
        for (const item of items) {
          console.log(`  Metadata: ${item.Name} = ${item.Value}`);
          if (item.Name === 'MpesaReceiptNumber') {
            mpesaReceipt = item.Value;
          }
          if (item.Name === 'Amount') {
            amount = item.Value;
          }
        }
        
        // Generate permanent order number
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        
        // Create the order
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
          mpesa_transaction_id: mpesaReceipt
        });
        
        await order.save();
        
        // Update stock
        for (const item of pendingOrder.items) {
          await Product.findByIdAndUpdate(item.product_id, {
            $inc: { stock: -item.quantity }
          });
        }
        
        // Clean up pending order
        delete global.pendingOrders[checkoutId];
        
        console.log(`✅ Order created: ${orderNumber}`);
        console.log(`✅ Stock updated`);
        console.log(`✅ Receipt: ${mpesaReceipt}`);
        
      } else {
        // Order might already exist or was processed differently
        console.log('⚠️ No pending order found for checkout ID, checking existing orders...');
        
        const existingOrder = await Order.findOne({ mpesa_transaction_id: checkoutId });
        if (!existingOrder) {
          console.log('❌ No order found for this payment');
        } else {
          console.log(`✅ Order already exists: ${existingOrder.order_number}`);
        }
      }
      
    } else {
      // PAYMENT FAILED
      console.log(`❌ Payment failed: ${resultDesc}`);
      
      if (pendingOrder) {
        // Mark as failed and clean up
        if (!global.failedPayments) global.failedPayments = {};
        global.failedPayments[checkoutId] = {
          reason: resultDesc,
          timestamp: new Date()
        };
        delete global.pendingOrders[checkoutId];
        console.log('✅ Cleaned up failed payment');
      }
    }
    
    console.log('========== CALLBACK PROCESSED ==========\n');
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
});

module.exports = router;
