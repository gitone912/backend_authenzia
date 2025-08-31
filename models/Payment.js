import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
  asset: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset',
    required: [true, 'Asset is required']
  },
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Make optional since we have buyerAddress
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller is required']
  },
  
  // Payment details
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'USDC',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'USDC', 'ETH', 'MATIC']
  },
  paymentMethod: {
    type: String,
    enum: ['coinbase', 'stripe', 'paypal', 'manual', 'x402', 'direct', 'auction'],
    default: 'x402'
  },

  // Blockchain specific fields
  buyerAddress: {
    type: String,
    lowercase: true
  },
  sellerAddress: {
    type: String,
    lowercase: true
  },
  network: {
    type: String,
    enum: ['base-sepolia', 'base-mainnet', 'ethereum', 'polygon'],
    default: 'base-sepolia'
  },
  transactionHash: {
    type: String,
    unique: true,
    sparse: true
  },
  blockNumber: {
    type: Number
  },
  tokenId: {
    type: String
  },
  contractAddress: {
    type: String
  },
  
  // Transaction details
  transactionId: {
    type: String,
    unique: true,
    sparse: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Coinbase specific fields (for future integration)
  coinbaseChargeId: String,
  coinbasePaymentId: String,
  coinbaseWebhookData: Object,
  
  // Access control
  accessGranted: {
    type: Boolean,
    default: false
  },
  accessGrantedAt: Date,
  accessExpiresAt: Date,
  
  // Delivery
  deliveryEmail: {
    type: String,
    required: [true, 'Delivery email is required']
  },
  originalFileSent: {
    type: Boolean,
    default: false
  },
  sentAt: Date,
  
  // Platform fees
  platformFee: {
    type: Number,
    default: 0
  },
  creatorAmount: {
    type: Number,
    default: 0
  },
  
  // Metadata
  ipAddress: String,
  userAgent: String,
  notes: String,
  
  // Timestamps
  paidAt: Date,
  refundedAt: Date
}, {
  timestamps: true
});

// Indexes for performance
paymentSchema.index({ asset: 1, buyer: 1 });
paymentSchema.index({ seller: 1, paymentStatus: 1 });
// Removed duplicate transactionId index (already defined in schema)
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ paymentStatus: 1, createdAt: -1 });

// Virtual for total amount with fees
paymentSchema.virtual('totalAmount').get(function() {
  return this.amount + this.platformFee;
});

// Virtual for formatted amount
paymentSchema.virtual('formattedAmount').get(function() {
  return `${this.currency} ${this.amount.toFixed(2)}`;
});

// Method to mark payment as completed
paymentSchema.methods.markCompleted = function(transactionId, coinbaseData = null) {
  this.paymentStatus = 'completed';
  this.transactionId = transactionId;
  this.paidAt = new Date();
  
  if (coinbaseData) {
    this.coinbaseWebhookData = coinbaseData;
  }
  
  return this.save();
};

// Method to grant access
paymentSchema.methods.grantAccess = function() {
  this.accessGranted = true;
  this.accessGrantedAt = new Date();
  this.accessExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  return this.save();
};

// Method to mark file as sent
paymentSchema.methods.markFileSent = function() {
  this.originalFileSent = true;
  this.sentAt = new Date();
  
  return this.save();
};

// Pre-save middleware to ensure numeric fields are valid
paymentSchema.pre('save', function(next) {
  // Fix numeric fields that might be NaN or undefined
  this.amount = (isNaN(this.amount) || this.amount === undefined) ? 0 : Number(this.amount);
  this.platformFee = (isNaN(this.platformFee) || this.platformFee === undefined) ? 0 : Number(this.platformFee);
  this.creatorAmount = (isNaN(this.creatorAmount) || this.creatorAmount === undefined) ? 0 : Number(this.creatorAmount);

  next();
});

// Method to calculate platform fees (example: 10% platform fee)
paymentSchema.methods.calculateFees = function() {
  // Ensure amount is a valid number
  const amount = (isNaN(this.amount) || this.amount === undefined) ? 0 : Number(this.amount);

  this.platformFee = Math.round(amount * 0.1 * 100) / 100; // 10% fee
  this.creatorAmount = amount - this.platformFee;

  return this.save();
};

// Static method to get payment statistics
paymentSchema.statics.getStats = async function(userId, timeframe = 'all') {
  const matchStage = { seller: userId };
  
  if (timeframe === 'month') {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    matchStage.createdAt = { $gte: startOfMonth };
  } else if (timeframe === 'week') {
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    matchStage.createdAt = { $gte: startOfWeek };
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    { $group: {
      _id: null,
      totalPayments: { $sum: 1 },
      totalRevenue: { $sum: '$amount' },
      totalFees: { $sum: '$platformFee' },
      netRevenue: { $sum: '$creatorAmount' }
    }}
  ]);
  
  return stats[0] || {
    totalPayments: 0,
    totalRevenue: 0,
    totalFees: 0,
    netRevenue: 0
  };
};

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
