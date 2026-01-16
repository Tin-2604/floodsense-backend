const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
// Allow multiple origins for development and production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001', 
  'http://localhost:5173', // Vite default port
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL // For production frontend
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // In production, allow all origins
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    // In development, check allowed origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Still allow for development flexibility
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Serve uploaded files (avatars, etc.) from the local uploads folder
// The files are saved under backend/uploads, so we expose /uploads -> ./uploads
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
// Try 127.0.0.1 instead of localhost if connection fails
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/floodsense';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upgrade', require('./routes/upgrade'));
app.use('/api/user', require('./routes/user'));
app.use('/api/payment', require('./routes/payment'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

