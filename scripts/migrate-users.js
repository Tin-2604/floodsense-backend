const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/floodsense';

async function migrateUsers() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find all users without role or with undefined role
    const usersWithoutRole = await User.find({
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: undefined }
      ]
    });

    console.log(`📊 Found ${usersWithoutRole.length} users without role`);

    if (usersWithoutRole.length === 0) {
      console.log('✅ All users already have role assigned');
      await mongoose.connection.close();
      return;
    }

    // Update users: set role to 'admin' if email is admin@gmail.com, otherwise 'user'
    let updatedCount = 0;
    for (const user of usersWithoutRole) {
      const role = user.email.toLowerCase() === 'admin@gmail.com' ? 'admin' : 'user';
      await User.updateOne(
        { _id: user._id },
        { 
          $set: { 
            role: role,
            hasMapAccess: user.hasMapAccess || false,
            upgradeStatus: user.upgradeStatus || 'none'
          } 
        }
      );
      updatedCount++;
      console.log(`✅ Updated user ${user.email} with role: ${role}`);
    }

    console.log(`\n🎉 Migration completed! Updated ${updatedCount} users.`);

    // Verify all users now have role
    const usersStillWithoutRole = await User.find({
      $or: [
        { role: { $exists: false } },
        { role: null },
        { role: undefined }
      ]
    });

    if (usersStillWithoutRole.length === 0) {
      console.log('✅ Verification: All users now have role assigned');
    } else {
      console.log(`⚠️  Warning: ${usersStillWithoutRole.length} users still without role`);
    }

    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

migrateUsers();

