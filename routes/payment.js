const express = require('express');
const router = express.Router();
const { payos } = require('../config/payos');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

// Tạo payment link
router.post('/create-payment-link', authenticate, async (req, res) => {
  try {
    const { amount, description } = req.body;
    const userId = req.user.id;

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

    // PayOS webhook structure: {data: {orderCode, amount, status, ...}, ...}
    const paymentData = webhookData.data || webhookData;
    
    console.log('Payment data:', JSON.stringify(paymentData, null, 2));
    console.log('Payment status:', paymentData.status);
    
    // Xử lý thanh toán thành công
    if (paymentData.status === 'PAID') {
      console.log('✅ Status is PAID, processing...');
      const orderCode = paymentData.orderCode;
      const amount = paymentData.amount;
      const description = paymentData.description;
      const buyerEmail = paymentData.buyerEmail;
      
      console.log(`Order: ${orderCode}, Amount: ${amount}, Email: ${buyerEmail}, Desc: ${description}`);
      
      // Parse userId từ description
      let userId = null;
      if (description && description.startsWith('USER_')) {
        const parts = description.split('_');
        if (parts.length > 1) {
          const potentialId = parts[1];
          // Kiểm tra xem có phải là valid ObjectId không (24 hex characters)
          if (potentialId && /^[0-9a-fA-F]{24}$/.test(potentialId)) {
            userId = potentialId;
          }
        }
      }
      
      // Ưu tiên tìm user qua userId
      let user = null;
      if (userId) {
        try {
          user = await User.findById(userId);
          console.log(`Found user by ID: ${user ? user.email : 'NOT FOUND'}`);
        } catch (err) {
          console.log('Invalid userId format:', userId);
        }
      }
      
      // Nếu không tìm thấy qua userId, thử qua email
      if (!user && buyerEmail) {
        user = await User.findOne({ email: buyerEmail });
        console.log(`Found user by email: ${user ? user.email : 'NOT FOUND'}`);
      }
      
      if (!user) {
        console.log('❌ USER NOT FOUND - Cannot process payment');
        return res.json({ success: true, message: 'User not found' });
      }
      
      console.log(`✅ Processing payment for user: ${user.email} (${user._id})`);
      
      if (user) {
        // Xác định số ngày gia hạn dựa trên số tiền thực nhận
        let daysToAdd = 0;
        let packageName = '';
        if (amount >= 60000) {
          daysToAdd = 180; // 6 tháng
          packageName = 'Gói 6 tháng';
        } else if (amount >= 30000) {
          daysToAdd = 90; // 3 tháng
          packageName = 'Gói 3 tháng';
        } else if (amount >= 10000) {
          daysToAdd = 30; // 1 tháng
          packageName = 'Gói 1 tháng';
        } else if (amount >= 2000) {
          daysToAdd = 2; // 2 ngày
          packageName = 'Gói 2 ngày';
        } else if (amount >= 1000) {
          daysToAdd = 1; // 1 ngày
          packageName = 'Gói 1 ngày';
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

        // Format ngày tháng cho description
        const expiryFormatted = newExpiryDate.toLocaleDateString('vi-VN');

        // Cập nhật user
        await User.findByIdAndUpdate(
          user._id,
          { 
            $inc: { money: amount },
            $set: { 
              hasMapAccess: true,
              upgradeStatus: 'approved',
              mapAccessExpiry: newExpiryDate,
              mapAccessGrantedAt: new Date()
            },
            $push: {
              transactions: {
                type: 'purchase',
                amount: amount,
                orderCode: orderCode.toString(),
                status: 'completed',
                createdAt: new Date(),
                description: `${packageName} - Gia hạn đến ${expiryFormatted}`
              }
            }
          }
        );

        console.log(`✅ Auto-upgraded: ${user.email} - ${packageName} (${daysToAdd} days) - Expires: ${expiryFormatted}`);
      }
    } else {
      console.log(`⚠️ Payment status is not PAID: ${paymentData.status}`);
    }

    console.log('====== WEBHOOK COMPLETED ======');
    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
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
    const user = await User.findById(req.user.id).select('-password');
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
