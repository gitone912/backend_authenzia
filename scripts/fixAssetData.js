import mongoose from 'mongoose';
import Asset from '../models/Asset.js';
import dotenv from 'dotenv';

dotenv.config();

const fixAssetData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/authenzia');
    console.log('✅ Connected to MongoDB');

    // Find all assets with invalid numeric fields
    const assets = await Asset.find({});
    console.log(`📊 Found ${assets.length} assets to check`);

    let fixedCount = 0;

    for (const asset of assets) {
      let needsUpdate = false;
      const updates = {};

      // Fix price
      if (isNaN(asset.price) || asset.price === undefined || asset.price === null) {
        updates.price = 0;
        needsUpdate = true;
        console.log(`🔧 Fixing price for asset: ${asset.title}`);
      }

      // Fix purchases
      if (isNaN(asset.purchases) || asset.purchases === undefined || asset.purchases === null) {
        updates.purchases = 0;
        needsUpdate = true;
        console.log(`🔧 Fixing purchases for asset: ${asset.title}`);
      }

      // Fix revenue
      if (isNaN(asset.revenue) || asset.revenue === undefined || asset.revenue === null) {
        updates.revenue = 0;
        needsUpdate = true;
        console.log(`🔧 Fixing revenue for asset: ${asset.title}`);
      }

      // Fix views
      if (isNaN(asset.views) || asset.views === undefined || asset.views === null) {
        updates.views = 0;
        needsUpdate = true;
        console.log(`🔧 Fixing views for asset: ${asset.title}`);
      }

      // Fix downloads
      if (isNaN(asset.downloads) || asset.downloads === undefined || asset.downloads === null) {
        updates.downloads = 0;
        needsUpdate = true;
        console.log(`🔧 Fixing downloads for asset: ${asset.title}`);
      }

      // Update if needed
      if (needsUpdate) {
        await Asset.findByIdAndUpdate(asset._id, updates);
        fixedCount++;
      }
    }

    console.log(`✅ Fixed ${fixedCount} assets`);
    console.log('🎉 Asset data migration completed successfully');

  } catch (error) {
    console.error('❌ Error fixing asset data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run the migration
fixAssetData();
