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
    console.log('Webhook received:', JSON.stringify(webhookData, null, 2));

    // PayOS webhook structure: {data: {orderCode, amount, status, ...}, ...}
    const paymentData = webhookData.data || webhookData;
    
    if (paymentData.status === 'PAID') {
      const orderCode = paymentData.orderCode;
      const amount = paymentData.amount;
      const description = paymentData.description || '';
      const buyerEmail = paymentData.buyerEmail;
      
      // Parse userId từ description
      let userId = null;
      if (description && description.startsWith('USER_')) {
        userId = description.split('_')[1];
      }
      
      // Tìm user
      let user = null;
      if (userId) {
        user = await User.findById(userId);
      }
      
      if (!user && buyerEmail) {
        user = await User.findOne({ email: buyerEmail });
      }
      
      if (!user) {
        console.log('User not found for payment:', { orderCode, buyerEmail });
        return res.json({ success: true });
      }

      // Tạo transaction
      const transaction = {
        type: 'deposit',
        amount: amount,
        orderCode: orderCode.toString(),
        status: 'completed',
        createdAt: new Date(),
        description: 'Nạp tiền vào tài khoản'
      };

      // Nếu là nạp tiền thông thường
      if (description.includes('Nap tien') || description.includes('Nạp tiền')) {
        await User.findByIdAndUpdate(
          user._id,
          { 
            $inc: { money: amount },
            $push: { transactions: transaction }
          }
        );
        console.log(`Added ${amount} to user ${user._id}'s balance`);
        return res.json({ success: true });
      }
      
      // Nếu là thanh toán gói dịch vụ
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
      }

      if (daysToAdd > 0) {
        let newExpiryDate = new Date();
        if (user.mapAccessExpiry && new Date(user.mapAccessExpiry) > new Date()) {
          newExpiryDate = new Date(user.mapAccessExpiry);
        }
        newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

        transaction.type = 'purchase';
        transaction.description = `Gia hạn ${daysToAdd} ngày`;

        await User.findByIdAndUpdate(
          user._id,
          { 
            $set: { 
              hasMapAccess: true,
              upgradeStatus: 'approved',
              mapAccessExpiry: newExpiryDate
            },
            $push: { transactions: transaction }
          }
        );
        console.log(`Extended map access for user ${user._id} by ${daysToAdd} days until ${newExpiryDate}`);
      } else {
        console.log(`Payment received but amount (${amount}) is insufficient for any package`);
      }
    }

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