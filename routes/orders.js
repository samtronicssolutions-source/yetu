// M-Pesa Callback URL
router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('\n📞 ========== M-PESA CALLBACK RECEIVED ==========');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    if (!data.Body || !data.Body.stkCallback) {
      console.log('⚠️ Invalid callback structure - missing stkCallback');
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
    
    // Find order by checkout ID (stored in mpesa_transaction_id during initiation)
    const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
    
    if (!order) {
      console.log(`❌ Order NOT found for checkout ID: ${checkoutId}`);
      console.log(`Looking for order with mpesa_transaction_id: ${checkoutId}`);
      return res.json({ ResultCode: 1, ResultDesc: 'Order not found' });
    }
    
    console.log(`✅ Found order: ${order.order_number}`);
    console.log(`Current status: payment=${order.payment_status}, order=${order.status}`);
    
    if (resultCode === 0) {
      // Payment successful
      const items = callback.CallbackMetadata?.Item || [];
      let mpesaReceipt = '';
      let amount = 0;
      let phone = '';
      
      for (const item of items) {
        console.log(`  Metadata: ${item.Name} = ${item.Value}`);
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
      
      // Update order
      order.payment_status = 'completed';
      order.status = 'processing';
      order.mpesa_transaction_id = mpesaReceipt;
      
      await order.save();
      
      console.log(`✅ PAYMENT SUCCESSFUL!`);
      console.log(`  Order: ${order.order_number}`);
      console.log(`  Receipt: ${mpesaReceipt}`);
      console.log(`  Amount: ${amount}`);
      console.log(`  Phone: ${phone}`);
      
    } else {
      // Payment failed
      order.payment_status = 'failed';
      order.status = 'cancelled';
      
      // Restore stock for failed payment
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product_id, {
          $inc: { stock: item.quantity }
        });
        console.log(`  Restored stock for product: ${item.product_id}`);
      }
      
      await order.save();
      
      console.log(`❌ PAYMENT FAILED: ${resultDesc}`);
    }
    
    console.log(`Updated order: payment=${order.payment_status}, status=${order.status}`);
    console.log('========== CALLBACK PROCESSED ==========\n');
    
    // Always respond with success to M-Pesa
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
});
