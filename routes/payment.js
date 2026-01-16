const express = require('express');
const router = express.Router();
const { payos } = require('../config/payos');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Tạo payment link
router.post('/create-payment-link', authenticate, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const userId = req.user.userId || req.user.id;

    console.log('Creating payment link for user:', userId, req.user.email);

    // Tạo order data theo PayOS API
    const orderData = {
      orderCode: Date.now(), // Unique order code
      amount: amount,
      description: `USER_${userId}_${description?.substring(0, 15) || 'Nap tien'}`,
      cancelUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/cancel`,
      returnUrl: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success`,
      buyerEmail: req.user.email,
      buyerName: req.user.name
    };

    console.log('Order data:', orderData);

    // Tạo payment link
    const paymentLinkResponse = await payos.paymentRequests.create(orderData);

    res.json({
      success: true,
      data: paymentLinkResponse
    });
  } catch (error) {
    console.error('Error creating payment link:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment link',
      error: error.message
    });
  }
});

// Webhook để nhận thông báo thanh toán
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    
    console.log('====== WEBHOOK RECEIVED ======');
    console.log('Full webhook data:', JSON.stringify(webhookData, null, 2));

    // PayOS webhook structure: {data: {orderCode, amount, code, desc, ...}, ...}
    const paymentData = webhookData.data || webhookData;
    
    console.log('Payment data:', paymentData);
    console.log('Payment code:', paymentData.code);
    console.log('Payment desc:', paymentData.desc);
    
    // PayOS trả về code: "00" và desc: "success" khi thanh toán thành công
    const isPaymentSuccess = paymentData.code === '00' || paymentData.code === 0 || paymentData.desc === 'success';
    
    console.log('Is payment success:', isPaymentSuccess);
    
    // Xử lý thanh toán thành công
    if (isPaymentSuccess) {
      const orderCode = paymentData.orderCode;
      const amount = paymentData.amount;
      const description = paymentData.description;
      const buyerEmail = paymentData.buyerEmail;
      
      console.log('Processing payment:');
      console.log('- OrderCode:', orderCode);
      console.log('- Amount:', amount);
      console.log('- Description:', description);
      console.log('- BuyerEmail:', buyerEmail);
      
      // Parse userId từ description
      let userId = null;
      if (description && description.includes('USER')) {
        // Format: "USERundefinedGoi 1 thang" hoặc "USER_123456_Goi 1 thang"
        const match = description.match(/USER[_]?([a-zA-Z0-9]+)/);
        if (match && match[1] && match[1] !== 'undefined') {
          userId = match[1];
        }
      }
      
      console.log('Parsed userId:', userId);
      
      // Ưu tiên tìm user qua userId
      let user = null;
      if (userId) {
        user = await User.findById(userId);
        console.log('User found by ID:', user ? user.email : 'Not found');
      }
      
      // Nếu không tìm thấy qua userId, thử qua email
      if (!user && buyerEmail) {
        user = await User.findOne({ email: buyerEmail });
        console.log('User found by email:', user ? user.email : 'Not found');
      }
      
      if (!user) {
        console.error('❌ USER NOT FOUND - userId:', userId, 'email:', buyerEmail);
        return res.json({ success: true, message: 'User not found' });
      }
      
      if (user) {
        // Xác định số ngày gia hạn dựa trên số tiền thực nhận
        let daysToAdd = 0;
        if (amount >= 60000) {
          daysToAdd = 180; // 6 tháng
        } else if (amount >= 30000) {
          daysToAdd = 90; // 3 tháng
        } else if (amount >= 10000) {
          daysToAdd = 30; // 1 tháng
        } else if (amount >= 2000) {
          daysToAdd = 2; // 2 ngày
        } else if (amount >= 1000) {
          daysToAdd = 1; // 1 ngày
        } else {
          // Số tiền không đủ, không gia hạn
          console.log(`Payment received but amount insufficient: ${amount} for user ${user._id}`);
          return res.json({ success: true });
        }

        let newExpiryDate = new Date();
        
        // Nếu đã có expiry date, gia hạn từ đó
        if (user.mapAccessExpiry && user.mapAccessExpiry > new Date()) {
          newExpiryDate = new Date(user.mapAccessExpiry);
        }
        
        // Cộng thêm ngày
        newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

        // Cập nhật user
        await User.findByIdAndUpdate(
          user._id,
          { 
            $inc: { money: amount },
            $set: { 
              hasMapAccess: true,
              upgradeStatus: 'approved',
              mapAccessExpiry: newExpiryDate
            },
            $push: {
              transactions: {
                type: 'purchase',
                amount: amount,
                orderCode: orderCode.toString(),
                status: 'completed',
                createdAt: new Date(),
                description: `Gia hạn ${daysToAdd} ngày`
              }
            }
          }
        );

        console.log(`✅ Extended map access for user ${user._id} (${user.email}) by ${daysToAdd} days until ${newExpiryDate}`);
        console.log(`✅ Added ${amount} VND to user balance`);
      }
    } else {
      console.log('⚠️ Payment not successful - code:', paymentData.code, 'desc:', paymentData.desc);
    }

    console.log('====== WEBHOOK COMPLETED ======');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing error',
      error: error.message
    });
  }
});

// Lấy thông tin thanh toán theo order code
router.get('/check-status/:orderCode', authenticate, async (req, res) => {
  try {
    const { orderCode } = req.params;
    
    // Lấy thông tin payment link từ PayOS
    const paymentInfo = await payos.paymentRequests.get(orderCode);
    
    res.json({
      success: true,
      data: paymentInfo
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking payment status',
      error: error.message
    });
  }
});

// Lấy thông tin user (bao gồm số tiền)
router.get('/user-info', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const user = await User.findById(userId).select('-password');
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user info',
      error: error.message
    });
  }
});

module.exports = router;
