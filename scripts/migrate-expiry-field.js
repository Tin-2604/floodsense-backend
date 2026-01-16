/**
 * Migration script: Chuyển đổi mapAccessExpiresAt sang mapAccessExpiry
 * Chạy script này một lần để cập nhật tất cả user trong database
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/floodsense';

async function migrateExpiryField() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

    // Tìm tất cả users có mapAccessExpiresAt
    const usersToUpdate = await User.find({ 
      mapAccessExpiresAt: { $exists: true } 
    });

    console.log(`📊 Found ${usersToUpdate.length} users with mapAccessExpiresAt field`);

    let updated = 0;
    for (const user of usersToUpdate) {
      // Copy giá trị từ mapAccessExpiresAt sang mapAccessExpiry
      await User.updateOne(
        { _id: user._id },
        {
          $set: { mapAccessExpiry: user.mapAccessExpiresAt },
          $unset: { mapAccessExpiresAt: "" }
        }
      );
      updated++;
      console.log(`✅ Updated user ${user.email} (${updated}/${usersToUpdate.length})`);
    }

    console.log(`\n🎉 Migration completed! Updated ${updated} users.`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

migrateExpiryField();
