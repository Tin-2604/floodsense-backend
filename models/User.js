const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  hasMapAccess: {
    type: Boolean,
    default: false,
  },
  upgradeStatus: {
    type: String,
    enum: ['none', 'pending', 'approved'],
    default: 'none',
  },
  upgradeRequestedAt: {
    type: Date,
  },
  mapAccessGrantedAt: {
    type: Date,
  },
  img: {
    type: String,
  },
  money: {
    type: Number,
    default: 0,
    min: 0,
  },
  transactions: [{
    type: {
      type: String,
      enum: ['deposit', 'purchase'],
      default: 'deposit'
    },
    amount: {
      type: Number,
      required: true
    },
    orderCode: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  mapAccessExpiry: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

