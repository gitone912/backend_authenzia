import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'digital-art',
      'ui-design',
      'photography',
      'motion-graphics',
      'documents',
      'illustrations',
      '3d-models',
      'audio',
      'video',
      'other'
    ]
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, 'Tag cannot exceed 20 characters']
  }],
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD']
  },
  
  // File information
  originalFile: {
    filename: String,
    path: String,
    size: Number,
    mimetype: String,
    hash: String, // SHA-256 hash for duplicate detection
    perceptualHash: String // pHash for similarity detection
  },

  // IPFS storage information
  ipfsData: {
    cid: String, // IPFS Content Identifier
    url: String, // IPFS gateway URL
    gateway: String, // Gateway used
    provider: String, // web3.storage, pinata, etc.
    hash: String, // SHA-256 hash
    metadataCid: String, // CID of NFT metadata JSON
    metadataUrl: String // URL of NFT metadata JSON
  },
  watermarkedFile: {
    filename: String,
    path: String,
    size: Number,
    mimetype: String
  },
  thumbnail: {
    filename: String,
    path: String,
    size: Number
  },
  
  // QR Code information
  qrCode: {
    filename: String,
    path: String,
    paymentUrl: String
  },
  
  // Status and visibility
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'flagged'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isApproved: {
    type: Boolean,
    default: false
  },
  
  // Analytics
  views: {
    type: Number,
    default: 0
  },
  downloads: {
    type: Number,
    default: 0
  },
  purchases: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number,
    default: 0
  },
  
  // AI verification
  aiVerified: {
    type: Boolean,
    default: false
  },
  duplicateCheck: {
    isDuplicate: Boolean,
    similarAssets: [{
      assetId: mongoose.Schema.Types.ObjectId,
      similarity: Number,
      confidence: Number
    }],
    checkedAt: Date
  },
  
  // Metadata
  dimensions: {
    width: Number,
    height: Number
  },
  fileFormat: String,
  colorProfile: String,
  resolution: String,
  
  // Licensing
  license: {
    type: String,
    enum: ['personal', 'commercial', 'extended', 'exclusive'],
    default: 'personal'
  },
  usageRights: [String],

  // Blockchain/NFT information
  nftData: {
    contractAddress: String, // Smart contract address
    tokenId: String, // NFT token ID
    chainId: Number, // Blockchain network ID
    transactionHash: String, // Minting transaction hash
    ownerAddress: String, // Current NFT owner
    isMinted: { type: Boolean, default: false },
    isLazyMinted: { type: Boolean, default: false },
    mintedAt: Date,
    royaltyPercentage: { type: Number, default: 10 }, // Creator royalty %
    mintPrice: Number // Price at which NFT was minted
  },

  // X402 payment configuration
  x402Config: {
    type: Object,
    default: {}
  },
  
  // Moderation
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending'
  },
  moderationNotes: String,
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedAt: Date
}, {
  timestamps: true
});

// Indexes for performance
assetSchema.index({ creator: 1, status: 1 });
assetSchema.index({ category: 1, status: 1 });
assetSchema.index({ price: 1 });
assetSchema.index({ createdAt: -1 });
assetSchema.index({ views: -1 });
assetSchema.index({ 'originalFile.hash': 1 }); // For duplicate detection
assetSchema.index({ title: 'text', description: 'text', tags: 'text' }); // For search

// Virtual for formatted price
assetSchema.virtual('formattedPrice').get(function() {
  return `${this.currency} ${this.price.toFixed(2)}`;
});

// Virtual for total earnings
assetSchema.virtual('totalEarnings').get(function() {
  return this.revenue;
});

// Method to increment views
assetSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Method to increment downloads
assetSchema.methods.incrementDownloads = function() {
  this.downloads += 1;
  return this.save();
};

// Pre-save middleware to ensure numeric fields are valid
assetSchema.pre('save', function(next) {
  // Fix numeric fields that might be NaN or undefined
  this.price = (isNaN(this.price) || this.price === undefined) ? 0 : Number(this.price);
  this.views = (isNaN(this.views) || this.views === undefined) ? 0 : Number(this.views);
  this.downloads = (isNaN(this.downloads) || this.downloads === undefined) ? 0 : Number(this.downloads);
  this.purchases = (isNaN(this.purchases) || this.purchases === undefined) ? 0 : Number(this.purchases);
  this.revenue = (isNaN(this.revenue) || this.revenue === undefined) ? 0 : Number(this.revenue);

  next();
});

// Method to record purchase
assetSchema.methods.recordPurchase = function(amount) {
  // Ensure purchases is a valid number, default to 0 if undefined or NaN
  this.purchases = (isNaN(this.purchases) || this.purchases === undefined) ? 0 : this.purchases;
  this.purchases += 1;

  // Ensure revenue is a valid number, default to 0 if undefined or NaN
  this.revenue = (isNaN(this.revenue) || this.revenue === undefined) ? 0 : this.revenue;
  const purchaseAmount = (isNaN(amount) || amount === undefined) ? 0 : Number(amount);
  this.revenue += purchaseAmount;

  return this.save();
};

// Method to get public asset data (without sensitive file paths)
assetSchema.methods.getPublicData = function() {
  return {
    _id: this._id,
    title: this.title,
    description: this.description,
    creator: this.creator,
    category: this.category,
    tags: this.tags,
    price: this.price,
    currency: this.currency,
    formattedPrice: this.formattedPrice,
    thumbnail: this.thumbnail,
    qrCode: this.qrCode,
    status: this.status,
    isPublic: this.isPublic,
    isApproved: this.isApproved,
    views: this.views,
    downloads: this.downloads,
    purchases: this.purchases,
    revenue: this.revenue,
    aiVerified: this.aiVerified,
    dimensions: this.dimensions,
    fileFormat: this.fileFormat,
    license: this.license,
    usageRights: this.usageRights,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const Asset = mongoose.model('Asset', assetSchema);

export default Asset;
