const express = require('express');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Request upgrade (User only)
router.post('/request', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.upgradeStatus === 'approved' && user.hasMapAccess) {
      return res.status(400).json({
        success: false,
        message: 'User already has map access',
      });
    }

    user.upgradeStatus = 'pending';
    user.upgradeRequestedAt = new Date();

    await user.save();

    console.log(`📝 Upgrade requested by user: ${user.email}`);

    res.json({
      success: true,
      message: 'Upgrade request submitted. Waiting for admin approval.',
      upgradeStatus: user.upgradeStatus,
    });
  } catch (error) {
    console.error('Upgrade request error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Get upgrade status (User only)
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Check if access has expired
    let hasAccess = user.hasMapAccess;
    if (hasAccess && user.mapAccessExpiry) {
      const now = new Date();
      if (now > user.mapAccessExpiry) {
        // Access expired, revoke it
        user.hasMapAccess = false;
        user.upgradeStatus = 'none';
        await user.save();
        hasAccess = false;
      }
    }

    res.json({
      success: true,
      upgradeStatus: user.upgradeStatus,
      hasMapAccess: hasAccess,
      upgradeRequestedAt: user.upgradeRequestedAt,
      mapAccessGrantedAt: user.mapAccessGrantedAt,
      mapAccessExpiry: user.mapAccessExpiry,
    });
  } catch (error) {
    console.error('Get upgrade status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

module.exports = router;

