import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, optionalAuth } from '../middleware/auth.js';
import Payment from '../models/Payment.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * @swagger
 * /payments/create:
 *   post:
 *     summary: Create a new payment for an asset
 *     description: Create a payment record for purchasing an asset (public endpoint)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetId
 *               - email
 *               - amount
 *             properties:
 *               assetId:
 *                 type: string
 *                 pattern: '^[0-9a-fA-F]{24}$'
 *                 description: MongoDB ObjectId of the asset
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Buyer's email address
 *               amount:
 *                 type: number
 *                 minimum: 0
 *                 description: Payment amount (must match asset price)
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Payment created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     payment:
 *                       $ref: '#/components/schemas/Payment'
 *                     paymentUrl:
 *                       type: string
 *                       description: URL to complete payment
 *       400:
 *         description: Validation error or amount mismatch
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Asset not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/create', [
  body('assetId')
    .isMongoId()
    .withMessage('Valid asset ID is required'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Valid amount is required')
], async (req, res) => {
  try {
    console.log('💰 Payment creation request:', {
      body: req.body,
      headers: req.headers.authorization ? 'Present' : 'Missing'
    });

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { assetId, email, amount } = req.body;

    // Check if asset exists and is available
    const asset = await Asset.findById(assetId)
      .populate('creator', 'username fullName');

    if (!asset) {
      console.log('❌ Asset not found:', assetId);
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    console.log('✅ Asset found:', {
      id: asset._id,
      title: asset.title,
      price: asset.price,
      isPublic: asset.isPublic,
      status: asset.status
    });

    // Check asset availability - be more lenient for development
    const isPublic = asset.isPublic !== false; // Default to true if undefined
    const status = asset.status || 'published'; // Default to published if undefined

    if (!isPublic || (status !== 'published' && status !== 'active')) {
      console.log('❌ Asset not available:', {
        isPublic: asset.isPublic,
        status: asset.status,
        computed: { isPublic, status }
      });
      return res.status(400).json({
        success: false,
        error: 'Asset is not available for purchase'
      });
    }

    // Validate amount matches asset price
    const assetPrice = (isNaN(asset.price) || asset.price === undefined) ? 0 : Number(asset.price);
    const paymentAmount = (isNaN(amount) || amount === undefined) ? 0 : Number(amount);

    console.log('💰 Price validation:', {
      assetPrice,
      paymentAmount,
      difference: Math.abs(paymentAmount - assetPrice)
    });

    if (Math.abs(paymentAmount - assetPrice) > 0.01) { // Allow small floating point differences
      console.log('❌ Price mismatch:', {
        expected: assetPrice,
        received: paymentAmount
      });
      return res.status(400).json({
        success: false,
        error: `Amount does not match asset price. Expected: $${assetPrice}, Received: $${paymentAmount}`
      });
    }

    // Check if user is already authenticated
    let buyer = null;
    if (req.headers.authorization) {
      try {
        // Extract user from token if available
        const token = req.headers.authorization.split(' ')[1];
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        buyer = await User.findById(decoded.id);
      } catch (error) {
        // Token is invalid, continue as guest
      }
    }

    // Additional validation for asset price (already declared above)
    console.log('💰 Final asset price validation:', {
      originalPrice: asset.price,
      computedPrice: assetPrice,
      isValid: assetPrice >= 0
    });

    if (assetPrice < 0) {
      console.log('❌ Invalid asset price:', assetPrice);
      return res.status(400).json({
        success: false,
        error: 'Asset price cannot be negative'
      });
    }

    // Allow free assets (price = 0) for development
    if (assetPrice === 0) {
      console.log('ℹ️ Processing free asset purchase');
    }

    // Create payment record
    const payment = new Payment({
      asset: assetId,
      buyer: buyer ? buyer._id : null,
      seller: asset.creator._id,
      amount: assetPrice,
      currency: asset.currency || 'USD',
      paymentMethod: 'coinbase', // Placeholder for future integration
      deliveryEmail: email,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Calculate platform fees
    await payment.calculateFees();

    await payment.save();

    // Generate payment URL (placeholder for Coinbase integration)
    const paymentUrl = `${process.env.FRONTEND_URL}/payment/${payment._id}`;

    res.status(201).json({
      success: true,
      message: 'Payment created successfully',
      data: {
        payment: {
          _id: payment._id,
          amount: payment.amount,
          currency: payment.currency,
          platformFee: payment.platformFee,
          totalAmount: payment.totalAmount,
          paymentUrl,
          status: payment.paymentStatus
        },
        asset: {
          _id: asset._id,
          title: asset.title,
          creator: asset.creator.username,
          price: asset.price
        }
      }
    });

  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while creating payment'
    });
  }
});

// @route   POST /api/payments/:paymentId/process
// @desc    Process payment (hardcoded for now)
// @access  Public
router.post('/:paymentId/process', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email } = req.body;
    const paymentId = req.params.paymentId;

    // Find payment
    const payment = await Payment.findById(paymentId)
      .populate('asset', 'title creator originalFile')
      .populate('seller', 'username fullName');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    if (payment.paymentStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Payment has already been processed'
      });
    }

    // HARDCODED PAYMENT PROCESSING (replace with Coinbase integration later)
    // Simulate successful payment
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Mark payment as completed
    await payment.markCompleted(transactionId);
    
    // Grant access to the asset
    await payment.grantAccess();

    // Update asset statistics
    const purchaseAmount = (isNaN(payment.amount) || payment.amount === undefined) ? 0 : Number(payment.amount);
    await payment.asset.recordPurchase(purchaseAmount);

    // Update seller earnings
    const creatorAmount = (isNaN(payment.creatorAmount) || payment.creatorAmount === undefined) ? 0 : Number(payment.creatorAmount);
    await User.findByIdAndUpdate(payment.seller._id, {
      $inc: { totalEarnings: creatorAmount, totalSales: 1 }
    });

    // TODO: Send email with download link
    // For now, just mark as sent
    await payment.markFileSent();

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment: {
          _id: payment._id,
          status: payment.paymentStatus,
          transactionId: payment.transactionId,
          accessGranted: payment.accessGranted,
          accessExpiresAt: payment.accessExpiresAt
        },
        asset: {
          _id: payment.asset._id,
          title: payment.asset.title,
          downloadUrl: `/api/payments/${paymentId}/download` // Protected download endpoint
        }
      }
    });

  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while processing payment'
    });
  }
});

// @route   GET /api/payments/:paymentId/download
// @desc    Download original asset after payment
// @access  Private (payment verification)
router.get('/:paymentId/download', async (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required for download'
      });
    }

    // Find payment
    const payment = await Payment.findById(paymentId)
      .populate('asset', 'originalFile title');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Verify payment status and access
    if (payment.paymentStatus !== 'completed') {
      return res.status(403).json({
        success: false,
        error: 'Payment not completed'
      });
    }

    if (!payment.accessGranted) {
      return res.status(403).json({
        success: false,
        error: 'Access not granted'
      });
    }

    // Check if access has expired
    if (payment.accessExpiresAt && new Date() > payment.accessExpiresAt) {
      return res.status(403).json({
        success: false,
        error: 'Download access has expired'
      });
    }

    // Verify email matches
    if (payment.deliveryEmail !== email) {
      return res.status(403).json({
        success: false,
        error: 'Email does not match payment record'
      });
    }

    // Get file path
    const filePath = payment.asset.originalFile.path;
    const filename = payment.asset.originalFile.filename;

    // Check if file exists
    const fs = await import('fs/promises');
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Increment download count
    await payment.asset.incrementDownloads();

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', payment.asset.originalFile.mimetype || 'application/octet-stream');

    // Stream file
    const fileStream = await import('fs');
    fileStream.createReadStream(filePath).pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during download'
    });
  }
});

// @route   GET /api/payments/:paymentId/status
// @desc    Get payment status
// @access  Public
router.get('/:paymentId/status', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.paymentId)
      .populate('asset', 'title creator')
      .populate('seller', 'username');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: {
        payment: {
          _id: payment._id,
          status: payment.paymentStatus,
          amount: payment.amount,
          currency: payment.currency,
          platformFee: payment.platformFee,
          totalAmount: payment.totalAmount,
          accessGranted: payment.accessGranted,
          accessExpiresAt: payment.accessExpiresAt,
          createdAt: payment.createdAt,
          paidAt: payment.paidAt
        },
        asset: {
          _id: payment.asset._id,
          title: payment.asset.title,
          creator: payment.seller.username
        }
      }
    });

  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching payment status'
    });
  }
});

// @route   GET /api/payments/user/:userId
// @desc    Get user's payment history
// @access  Private
router.get('/user/:userId', protect, async (req, res) => {
  try {
    // Check if user is requesting their own payments or is admin
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view other user payments'
      });
    }

    const { page = 1, limit = 10, type = 'all' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter
    let filter = {};
    if (type === 'purchases') {
      filter.buyer = req.user._id;
    } else if (type === 'sales') {
      filter.seller = req.user._id;
    } else {
      filter.$or = [{ buyer: req.user._id }, { seller: req.user._id }];
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('asset', 'title thumbnail')
        .populate('buyer', 'username fullName')
        .populate('seller', 'username fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Payment.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalPayments: total,
          hasNextPage: skip + parseInt(limit) < total,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get user payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching user payments'
    });
  }
});

// @route   GET /api/payments/stats/:userId
// @desc    Get user's payment statistics
// @access  Private
router.get('/stats/:userId', protect, async (req, res) => {
  try {
    // Check if user is requesting their own stats or is admin
    if (req.params.userId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view other user stats'
      });
    }

    const { timeframe = 'all' } = req.query;

    // Get stats for different timeframes
    const [allTime, monthly, weekly] = await Promise.all([
      Payment.getStats(req.user._id, 'all'),
      Payment.getStats(req.user._id, 'month'),
      Payment.getStats(req.user._id, 'week')
    ]);

    res.json({
      success: true,
      data: {
        allTime,
        monthly,
        weekly
      }
    });

  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching payment stats'
    });
  }
});

// @route   POST /api/payments/test
// @desc    Test payment creation (development only)
// @access  Public
router.post('/test', async (req, res) => {
  try {
    console.log('🧪 Test payment endpoint called:', req.body);

    res.json({
      success: true,
      message: 'Payment API is working',
      data: {
        timestamp: new Date().toISOString(),
        body: req.body,
        headers: {
          authorization: req.headers.authorization ? 'Present' : 'Missing',
          contentType: req.headers['content-type']
        }
      }
    });
  } catch (error) {
    console.error('Test payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Test payment failed',
      details: error.message
    });
  }
});

export default router;
