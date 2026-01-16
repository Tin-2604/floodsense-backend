/**
 * Script để trigger webhook thủ công cho các giao dịch đã thanh toán
 * Dùng khi PayOS webhook không được gọi tự động
 */

const axios = require('axios');

// Thay đổi thông tin này theo giao dịch thực tế
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const EMAIL = process.env.USER_EMAIL || 'test2@test.com';
const AMOUNT = parseInt(process.env.AMOUNT) || 10000;
const ORDER_CODE = process.env.ORDER_CODE || Date.now().toString();

async function triggerWebhook() {
  try {
    console.log('🔄 Triggering webhook manually...');
    console.log(`📧 Email: ${EMAIL}`);
    console.log(`💰 Amount: ${AMOUNT} VNĐ`);
    console.log(`📦 Order Code: ${ORDER_CODE}`);
    
    const webhookData = {
      data: {
        orderCode: ORDER_CODE,
        amount: AMOUNT,
        status: 'PAID',
        description: `USER_manual_Gia han`,
        buyerEmail: EMAIL
      }
    };

    const response = await axios.post(
      `${BACKEND_URL}/api/payment/webhook`,
      webhookData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Webhook triggered successfully!');
    console.log('Response:', response.data);
  } catch (error) {
    console.error('❌ Error triggering webhook:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

triggerWebhook();
