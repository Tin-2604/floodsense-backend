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

    // Tạo description ngắn (max 25 ký tự)
    const shortUserId = userId.toString().slice(-6); // Lấy 6 ký tự cuối
    const shortDesc = description?.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) || 'NAP';
    const paymentDesc = `${shortUserId}_${shortDesc}`; // Max ~15 ký tự

    // Tạo order data theo PayOS API
    const orderData = {
      orderCode: Date.now(), // Unique order code
      amount: amount,
      description: paymentDesc,
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
    
    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Full webhook data:', JSON.stringify(webhookData, null, 2));
    console.log('Request headers:', req.headers);

    // PayOS webhook structure: {data: {orderCode, amount, status, ...}, ...}
    const paymentData = webhookData.data || webhookData;
    
    // Xử lý thanh toán thành công
    if (paymentData.status === 'PAID') {
      const orderCode = paymentData.orderCode;
      const amount = paymentData.amount;
      const description = paymentData.description;
      const buyerEmail = paymentData.buyerEmail;
      
      // Tìm user qua email (đơn giản và đáng tin cậy nhất)
      const user = await User.findOne({ email: buyerEmail });
      
      if (user) {
        console.log(`✅ Found user: ${user._id} (${user.email})`);
        
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

        console.log(`✅ Extended map access for user ${user._id} by ${daysToAdd} days until ${newExpiryDate}`);
      } else {
        console.log(`❌ User not found! userId: ${userId}, buyerEmail: ${buyerEmail}`);
      }
    } else {
      console.log(`⚠️ Payment status is not PAID: ${paymentData.status}`);
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

// Test endpoint để kiểm tra webhook manually (CHỈ CHO DEVELOPMENT)
router.post('/test-webhook', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Not allowed in production' });
  }

  try {
    const { userId, amount } = req.body;
    
    if (!userId || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'userId and amount are required' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Xác định số ngày gia hạn
    let daysToAdd = 0;
    if (amount >= 60000) {
      daysToAdd = 180;
    } else if (amount >= 30000) {
      daysToAdd = 90;
    } else if (amount >= 10000) {
      daysToAdd = 30;
    } else if (amount >= 2000) {
      daysToAdd = 2;
    } else if (amount >= 1000) {
      daysToAdd = 1;
    }

    let newExpiryDate = new Date();
    if (user.mapAccessExpiry && user.mapAccessExpiry > new Date()) {
      newExpiryDate = new Date(user.mapAccessExpiry);
    }
    newExpiryDate.setDate(newExpiryDate.getDate() + daysToAdd);

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
            orderCode: 'TEST_' + Date.now(),
            status: 'completed',
            createdAt: new Date(),
            description: `Test - Gia hạn ${daysToAdd} ngày`
          }
        }
      }
    );

    res.json({
      success: true,
      message: `Upgraded user ${user.email} for ${daysToAdd} days until ${newExpiryDate}`,
      data: {
        userId: user._id,
        email: user.email,
        daysAdded: daysToAdd,
        expiryDate: newExpiryDate
      }
    });
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing test webhook',
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
    
    // Tính toán số ngày còn lại nếu có expiry date
    let daysRemaining = null;
    if (user.mapAccessExpiry) {
      const now = new Date();
      const expiry = new Date(user.mapAccessExpiry);
      const diffTime = expiry - now;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    res.json({
      success: true,
      data: {
        ...user.toObject(),
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isExpired: daysRemaining !== null && daysRemaining <= 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user info',
      error: error.message
    });
  }
});

// Debug endpoint - lấy thông tin user by email (CHỈ CHO DEVELOPMENT)
router.get('/debug/user/:email', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Not allowed in production' });
  }

  try {
    const user = await User.findOne({ email: req.params.email }).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Tính toán số ngày còn lại
    let daysRemaining = null;
    if (user.mapAccessExpiry) {
      const now = new Date();
      const expiry = new Date(user.mapAccessExpiry);
      const diffTime = expiry - now;
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasMapAccess: user.hasMapAccess,
        upgradeStatus: user.upgradeStatus,
        mapAccessExpiry: user.mapAccessExpiry,
        daysRemaining: daysRemaining,
        isExpired: daysRemaining !== null && daysRemaining <= 0,
        money: user.money,
        transactionCount: user.transactions?.length || 0,
        recentTransactions: user.transactions?.slice(-5) || []
      }
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
