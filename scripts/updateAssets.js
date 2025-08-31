import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Asset from '../models/Asset.js';

// Load environment variables
dotenv.config();

const updateAssets = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/authenzia');
    console.log('✅ Connected to MongoDB');

    // Update all existing assets to be published and approved
    const result = await Asset.updateMany(
      {}, // Update all assets
      {
        $set: {
          status: 'published',
          isPublic: true,
          isApproved: true
        }
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} assets to be published and approved`);

    // List all assets to verify
    const assets = await Asset.find({}).select('title status isPublic isApproved thumbnail');
    console.log('\n📋 Current assets:');
    assets.forEach(asset => {
      console.log(`- ${asset.title}: status=${asset.status}, public=${asset.isPublic}, approved=${asset.isApproved}, thumbnail=${asset.thumbnail?.filename || 'none'}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error updating assets:', error);
    process.exit(1);
  }
};

updateAssets();
