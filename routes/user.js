const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${req.user.userId || 'user'}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

// Update profile (currently used to update name; email kept from client)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { name, email } = req.body || {};

    const update = {};
    if (typeof name === 'string' && name.trim()) {
      update.name = name.trim();
    }
    if (typeof email === 'string' && email.trim()) {
      update.email = email.trim();
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    ).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        img: user.img,
        role: user.role,
        hasMapAccess: user.hasMapAccess,
        upgradeStatus: user.upgradeStatus,
        mapAccessGrantedAt: user.mapAccessGrantedAt,
        mapAccessExpiresAt: user.mapAccessExpiresAt,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// Upload avatar
router.post('/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Build full URL so frontend can use img directly
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imgUrl = `${baseUrl}/uploads/avatars/${req.file.filename}`;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { img: imgUrl } },
      { new: true }
    ).lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        img: user.img,
        role: user.role,
        hasMapAccess: user.hasMapAccess,
        upgradeStatus: user.upgradeStatus,
        mapAccessGrantedAt: user.mapAccessGrantedAt,
        mapAccessExpiresAt: user.mapAccessExpiresAt,
      },
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;
