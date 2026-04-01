// utils/mpesa.js
const axios = require('axios');

async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    return null;
  }
}

async function initiateMpesaPayment(phone, amount, orderNumber) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  
  const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
  
  // Format phone number
  let formattedPhone = phone.toString().trim();
  formattedPhone = formattedPhone.replace(/\D/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '254' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('254')) {
    formattedPhone = '254' + formattedPhone;
  }
  
  // CRITICAL: Use the correct callback URL
  const callbackUrl = 'https://yetu.onrender.com/api/orders/mpesa-callback';
  
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: formattedPhone,
    PartyB: shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl,
    AccountReference: orderNumber.slice(0, 12),
    TransactionDesc: `Yetu Payment`
  };
  
  console.log('Callback URL being sent:', callbackUrl);
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error initiating M-Pesa payment:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { initiateMpesaPayment, getAccessToken };
