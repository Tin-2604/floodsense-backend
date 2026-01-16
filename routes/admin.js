const express = require('express');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication
router.use(authenticate);

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
    }

    req.admin = user;
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Get all users (Admin only)
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    // Map _id to id for frontend consistency
    const usersWithId = users.map(user => ({
      ...user.toObject(),
      id: user._id.toString(),
    }));
    res.json({
      success: true,
      users: usersWithId,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Get single user (Admin only)
router.get('/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Update user (Admin only)
router.put('/users/:id', isAdmin, async (req, res) => {
  try {
    const { name, email, role, hasMapAccess } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (hasMapAccess !== undefined) {
      user.hasMapAccess = hasMapAccess;
      if (hasMapAccess) {
        user.upgradeStatus = 'approved';
        user.mapAccessGrantedAt = new Date();
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasMapAccess: user.hasMapAccess,
        upgradeStatus: user.upgradeStatus,
      },
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Delete user (Admin only)
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Grant map access to user (Admin only)
router.post('/users/:id/grant-map-access', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.hasMapAccess = true;
    user.upgradeStatus = 'approved';
    user.mapAccessGrantedAt = new Date();
    // Set expiration date: 30 days from now
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    user.mapAccessExpiresAt = expirationDate;

    await user.save();

    console.log(`✅ Map access granted to user: ${user.email}`);

    res.json({
      success: true,
      message: 'Map access granted successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        hasMapAccess: user.hasMapAccess,
        upgradeStatus: user.upgradeStatus,
        mapAccessGrantedAt: user.mapAccessGrantedAt,
        mapAccessExpiresAt: user.mapAccessExpiresAt,
      },
    });
  } catch (error) {
    console.error('Grant map access error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Revoke map access from user (Admin only)
router.post('/users/:id/revoke-map-access', isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    
    if (!userId || userId === 'undefined') {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.hasMapAccess = false;
    user.upgradeStatus = 'none';
    user.mapAccessExpiresAt = null;

    await user.save();

    console.log(`❌ Map access revoked from user: ${user.email}`);

    res.json({
      success: true,
      message: 'Map access revoked successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        hasMapAccess: user.hasMapAccess,
        upgradeStatus: user.upgradeStatus,
        mapAccessExpiresAt: user.mapAccessExpiresAt,
      },
    });
  } catch (error) {
    console.error('Revoke map access error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

// Get pending upgrade requests (Admin only)
router.get('/upgrade-requests', isAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ upgradeStatus: 'pending' }).select('-password');
    // Map _id to id for frontend consistency
    const usersWithId = pendingUsers.map(user => ({
      ...user.toObject(),
      id: user._id.toString(),
    }));
    res.json({
      success: true,
      users: usersWithId,
    });
  } catch (error) {
    console.error('Get upgrade requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
});

module.exports = router;

