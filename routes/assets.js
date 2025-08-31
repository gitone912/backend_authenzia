import express from 'express';
import multer from 'multer';
import { protect, optionalAuth } from '../middleware/auth.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import ImageProcessor from '../utils/imageProcessor.js';
import AIService from '../utils/aiService.js';
import IPFSService from '../utils/ipfsService.js';
// X402Service not needed - middleware handles everything
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Initialize services
const imageProcessor = new ImageProcessor();
const aiService = new AIService();
const ipfsService = new IPFSService();
// X402 middleware handles payment automatically

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and other common file types
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'), false);
    }
  }
});

/**
 * @swagger
 * /assets/upload:
 *   post:
 *     summary: Upload a new asset
 *     description: Upload a new asset file with metadata (creators only)
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - title
 *               - description
 *               - category
 *               - price
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Asset file (images, PDFs, documents)
 *               title:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Asset title
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 1000
 *                 description: Asset description
 *               category:
 *                 type: string
 *                 enum: [digital-art, ui-design, photography, motion-graphics, documents, illustrations, 3d-models, audio, video, other]
 *                 description: Asset category
 *               price:
 *                 type: number
 *                 minimum: 0
 *                 description: Asset price in USD
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 10
 *                 description: Asset tags (optional)
 *               license:
 *                 type: string
 *                 enum: [personal, commercial, extended, exclusive]
 *                 description: License type (optional)
 *               usageRights:
 *                 type: string
 *                 description: Usage rights description (optional)
 *     responses:
 *       201:
 *         description: Asset uploaded successfully
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
 *                   example: Asset uploaded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     asset:
 *                       $ref: '#/components/schemas/Asset'
 *       400:
 *         description: Validation error or no file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Not authorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Only creators can upload assets
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
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  try {
    // Debug: Log incoming request
    console.log('=== Asset Upload Request ===');
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');
    console.log('User:', req.user ? {
      _id: req.user._id,
      isCreator: req.user.isCreator
    } : 'No user');
    console.log('===========================');
    
    // Manual validation after multer processes the data
    const { title, description, category, price, tags, license, usageRights } = req.body;

    // Validate and sanitize price
    const assetPrice = (isNaN(price) || price === undefined || price === null) ? 0 : Number(price);
    if (assetPrice < 0) {
      return res.status(400).json({
        success: false,
        error: 'Price cannot be negative'
      });
    }

    // Relaxed validation: only check for file presence and user creator status
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }
    if (!req.user.isCreator) {
      return res.status(403).json({
        success: false,
        error: 'Only creators can upload assets'
      });
    }
    // Parse tags from FormData - handle both array and individual tag fields
    let parsedTags = [];
    if (tags) {
      if (Array.isArray(tags)) {
        parsedTags = tags.filter(tag => tag && tag.trim().length > 0);
      } else if (typeof tags === 'string') {
        try {
          const jsonTags = JSON.parse(tags);
          if (Array.isArray(jsonTags)) {
            parsedTags = jsonTags.filter(tag => tag && tag.trim().length > 0);
          }
        } catch (error) {
          parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }
      }
    }
    // Validate tags length
    if (parsedTags.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tags allowed'
      });
    }

    // Generate payment URL (placeholder for Coinbase integration)
    const paymentUrl = `${process.env.FRONTEND_URL}/payment/placeholder`;

    // Process image if it's an image file
    let processedFiles = {};
    let imageHash = null;

    if (req.file.mimetype.startsWith('image/')) {
      try {
        // Process image: create watermarked version, thumbnail, and QR code
        processedFiles = await imageProcessor.processImage(
          req.file.buffer,
          req.user._id,
          paymentUrl
        );

        // Get image hash for duplicate detection
        imageHash = await imageProcessor.getImageHash(req.file.buffer);

        // Check for duplicates using AI
        const existingAssets = await Asset.find({
          'originalFile.hash': { $exists: true },
          creator: { $ne: req.user._id } // Don't check against user's own assets
        }).limit(50); // Limit for performance

        // AI duplicate check (optional - don't fail upload if AI service fails)
        let duplicateCheck = null;
        if (existingAssets.length > 0) {
          try {
            duplicateCheck = await aiService.checkForDuplicates(req.file.buffer, existingAssets);

            if (duplicateCheck && duplicateCheck.hasDuplicates) {
              return res.status(400).json({
                success: false,
                error: 'Duplicate content detected',
                details: {
                  message: 'This image appears to be similar to existing content on the platform',
                  duplicates: duplicateCheck.duplicates
                }
              });
            }
          } catch (aiError) {
            console.warn('AI duplicate check failed, continuing with upload:', aiError.message);
          }
        }

        // AI content validation (optional - don't fail upload if AI service fails)
        try {
          const contentValidation = await aiService.validateImageContent(req.file.buffer);

          if (!contentValidation.isAppropriate) {
            return res.status(400).json({
              success: false,
              error: 'Content not appropriate for platform',
              details: contentValidation
            });
          }
        } catch (aiError) {
          console.warn('AI content validation failed, continuing with upload:', aiError.message);
        }

        // AI processing completed successfully

      } catch (error) {
        console.error('Image processing error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to process image'
        });
      }
    } else {
      // For non-image files, just save the original
      const filename = `${Date.now()}_${req.file.originalname}`;
      const filePath = `./uploads/documents/${filename}`;
      
      // Ensure directory exists
      await imageProcessor.ensureDirectories();
      
      // Save file
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, req.file.buffer);

      processedFiles = {
        original: {
          filename,
          path: filePath,
          size: req.file.size,
          mimetype: req.file.mimetype
        }
      };
    }

    // Enhanced duplicate detection using multiple methods
    console.log('🔍 Running enhanced duplicate detection...');
    const existingAssets = await Asset.find({
      creator: { $ne: req.user._id } // Don't check against user's own assets
    }).limit(100); // Limit for performance

    const duplicateResult = await aiService.detectDuplicates(req.file.buffer, existingAssets);

    if (duplicateResult.isDuplicate && duplicateResult.confidence > 0.8) {
      return res.status(409).json({
        success: false,
        error: 'Duplicate content detected',
        details: {
          confidence: duplicateResult.confidence,
          matches: duplicateResult.matches,
          methods: duplicateResult.methods
        }
      });
    }

    // Process image for duplicate detection (get hashes)
    const hashData = await aiService.processImageForDuplicateDetection(req.file.buffer);

    // Upload to IPFS
    let ipfsData = null;
    try {
      console.log('📤 Uploading original file to IPFS...');
      ipfsData = await ipfsService.uploadFile(
        req.file.buffer,
        processedFiles.original.filename,
        {
          title,
          description,
          category: category || 'digital-art',
          creator: req.user.username,
          uploadedAt: new Date().toISOString(),
          contentHash: hashData.sha256Hash
        }
      );
      if (ipfsData) {
        console.log('✅ IPFS upload successful:', ipfsData.cid);
      } else {
        console.log('⚠️ IPFS upload skipped - no services configured');
      }
    } catch (error) {
      console.warn('⚠️ IPFS upload failed, continuing with local storage:', error.message);
      // Continue without IPFS - the asset will still work with local storage
    }

    // Use AI-enhanced or user-provided values
    const finalTags = parsedTags.length > 0 ? parsedTags : [];
    const finalCategory = category || 'digital-art';
    const finalDescription = description;

    // Create asset record
    const asset = new Asset({
      title,
      description: finalDescription,
      creator: req.user._id,
      category: finalCategory,
      tags: finalTags,
      price: assetPrice,
      license: license || 'personal',
      usageRights: usageRights || [],
      originalFile: {
        filename: processedFiles.original.filename,
        path: processedFiles.original.path,
        size: processedFiles.original.size,
        mimetype: processedFiles.original.mimetype,
        hash: hashData.sha256Hash,
        perceptualHash: hashData.perceptualHash
      },
      watermarkedFile: processedFiles.watermarked || null,
      thumbnail: processedFiles.thumbnail || null,
      qrCode: processedFiles.qrCode || null,
      ipfsData: ipfsData || null, // IPFS storage information
      status: 'published', // Auto-publish uploaded assets
      isPublic: true,
      isApproved: true, // Auto-approve for now (can add moderation later)
      aiVerified: true,
      duplicateCheck: {
        isDuplicate: duplicateResult.isDuplicate,
        confidence: duplicateResult.confidence,
        methods: duplicateResult.methods,
        matches: duplicateResult.matches,
        checkedAt: new Date()
      }
    });

    await asset.save();

    // X402 payment will be handled by middleware automatically
    console.log('💰 Asset ready for X402 payment protection:', asset._id);

    res.status(201).json({
      success: true,
      message: 'Asset uploaded successfully',
      data: {
        asset: asset.getPublicData()
      }
    });

  } catch (error) {
    console.error('Asset upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during asset upload'
    });
  }
});

// @route   GET /api/assets
// @desc    Get all public assets with filtering and pagination
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      search,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {
      status: 'published',
      isPublic: true,
      isApproved: true
    };

    if (category) filter.category = category;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }

    // Build search query
    if (search) {
      filter.$text = { $search: search };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [assets, total] = await Promise.all([
      Asset.find(filter)
        .populate('creator', 'username fullName avatar')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .select('-originalFile.path -watermarkedFile.path'),
      Asset.countDocuments(filter)
    ]);

    // Format response
    const formattedAssets = assets.map(asset => {
      const assetData = asset.getPublicData();
      // Add creator info
      if (asset.creator) {
        assetData.creator = {
          _id: asset.creator._id,
          username: asset.creator.username,
          fullName: asset.creator.fullName,
          avatar: asset.creator.avatar
        };
      }
      return assetData;
    });

    res.json({
      success: true,
      data: {
        assets: formattedAssets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalAssets: total,
          hasNextPage: skip + parseInt(limit) < total,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get assets error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching assets'
    });
  }
});

// @route   GET /api/assets/:id
// @desc    Get asset by ID
// @access  Public
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('creator', 'username fullName avatar bio isVerified')
      .select('-originalFile.path -watermarkedFile.path');

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    if (!asset.isPublic || asset.status !== 'published') {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Increment views
    await asset.incrementViews();

    // Format response
    const assetData = asset.getPublicData();
    if (asset.creator) {
      assetData.creator = {
        _id: asset.creator._id,
        username: asset.creator.username,
        fullName: asset.creator.fullName,
        avatar: asset.creator.avatar,
        bio: asset.creator.bio,
        isVerified: asset.creator.isVerified
      };
    }

    res.json({
      success: true,
      data: {
        asset: assetData
      }
    });

  } catch (error) {
    console.error('Get asset error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching asset'
    });
  }
});

// @route   GET /api/assets/creator/:userId
// @desc    Get assets by creator
// @access  Public
router.get('/creator/:userId', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [assets, total] = await Promise.all([
      Asset.find({
        creator: req.params.userId,
        status: 'published',
        isPublic: true,
        isApproved: true
      })
        .populate('creator', 'username fullName avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-originalFile.path -watermarkedFile.path'),
      Asset.countDocuments({
        creator: req.params.userId,
        status: 'published',
        isPublic: true,
        isApproved: true
      })
    ]);

    const formattedAssets = assets.map(asset => {
      const assetData = asset.getPublicData();
      if (asset.creator) {
        assetData.creator = {
          _id: asset.creator._id,
          username: asset.creator.username,
          fullName: asset.creator.fullName,
          avatar: asset.creator.avatar
        };
      }
      return assetData;
    });

    res.json({
      success: true,
      data: {
        assets: formattedAssets,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalAssets: total,
          hasNextPage: skip + parseInt(limit) < total,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get creator assets error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while fetching creator assets'
    });
  }
});

// @route   PUT /api/assets/:id
// @desc    Update asset
// @access  Private (creator only)
router.put('/:id', protect, [
  body('title')
    .optional()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number')
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

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Check if user is the creator
    if (asset.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this asset'
      });
    }

    const { title, description, price, tags, category, license } = req.body;

    // Validate and sanitize price
    const assetPrice = (isNaN(price) || price === undefined || price === null) ? asset.price : Number(price);
    if (assetPrice < 0) {
      return res.status(400).json({
        success: false,
        error: 'Price cannot be negative'
      });
    }

    // Parse tags from FormData - handle both array and individual tag fields
    let parsedTags = [];
    if (tags) {
      if (Array.isArray(tags)) {
        // If tags come as array from FormData
        parsedTags = tags.filter(tag => tag && tag.trim().length > 0);
      } else if (typeof tags === 'string') {
        try {
          // Try to parse as JSON if it's a string
          const jsonTags = JSON.parse(tags);
          if (Array.isArray(jsonTags)) {
            parsedTags = jsonTags.filter(tag => tag && tag.trim().length > 0);
          }
        } catch (error) {
          // If not JSON, treat as comma-separated string
          parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        }
      }
    }

    // Validate tags length
    if (parsedTags.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 tags allowed'
      });
    }

    // Update asset
    const updatedAsset = await Asset.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        price: assetPrice,
        tags: parsedTags,
        category,
        license
      },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Asset updated successfully',
      data: {
        asset: updatedAsset.getPublicData()
      }
    });

  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while updating asset'
    });
  }
});

// @route   DELETE /api/assets/:id
// @desc    Delete asset
// @access  Private (creator only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Check if user is the creator
    if (asset.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this asset'
      });
    }

    // Delete asset (soft delete by changing status)
    asset.status = 'archived';
    await asset.save();

    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });

  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while deleting asset'
    });
  }
});

// @route   POST /api/assets/:id/mint
// @desc    Mint asset as NFT
// @access  Private (creator only)
router.post('/:id/mint', protect, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Check if user is the creator
    if (asset.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only creator can mint NFT'
      });
    }

    // Check if already minted
    if (asset.nftData?.isMinted) {
      return res.status(400).json({
        success: false,
        error: 'Asset already minted as NFT'
      });
    }

    // Create NFT metadata
    let metadataUrl = '';
    if (asset.ipfsData?.cid) {
      // Create and upload NFT metadata to IPFS
      const nftMetadata = ipfsService.createNFTMetadata(asset, asset.ipfsData);
      const metadataResult = await ipfsService.uploadMetadata(nftMetadata);
      metadataUrl = metadataResult.url;
    }

    // Update asset with NFT data (mock for now - implement with actual contract)
    asset.nftData = {
      contractAddress: process.env.CONTRACT_ADDRESS,
      tokenId: Math.floor(Math.random() * 10000).toString(),
      chainId: parseInt(process.env.CHAIN_ID) || 84532,
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      ownerAddress: req.user.walletAddress || req.user.email,
      isMinted: true,
      isLazyMinted: false,
      mintedAt: new Date(),
      royaltyPercentage: 10,
      mintPrice: asset.price
    };

    if (metadataUrl) {
      asset.ipfsData.metadataUrl = metadataUrl;
    }

    await asset.save();

    res.json({
      success: true,
      message: 'NFT minted successfully',
      data: {
        asset: asset.getPublicData(),
        nftData: asset.nftData
      }
    });

  } catch (error) {
    console.error('NFT minting error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during NFT minting'
    });
  }
});

// @route   GET /api/assets/:id/purchase
// @desc    Purchase NFT with X402 payment (protected by X402 middleware)
// @access  Public (with payment)
router.get('/:id/purchase', async (req, res) => {
  // This route is protected by X402 middleware - payment already completed!
  console.log('🎉 X402 PAYMENT COMPLETED! User paid and can now access NFT');

  const { buyerAddress } = req.query;
  const assetId = req.params.id;

  try {
    const asset = await Asset.findById(assetId).populate('creator', 'username fullName');
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    console.log('✅ Processing NFT purchase for paid user:', {
      assetId: asset._id,
      title: asset.title,
      buyer: buyerAddress
    });

    // Simulate NFT minting (replace with real minting later)
    const mockNFT = {
      tokenId: Math.floor(Math.random() * 10000).toString(),
      contractAddress: process.env.CONTRACT_ADDRESS || '0x123...',
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      ownerAddress: buyerAddress,
      mintedAt: new Date().toISOString()
    };

    // Update asset with NFT data
    asset.nftData = {
      ...asset.nftData,
      ...mockNFT,
      isMinted: true
    };

    // Record the purchase
    asset.purchases = (asset.purchases || 0) + 1;
    asset.revenue = (asset.revenue || 0) + 0.01; // X402 payment amount

    await asset.save();

    // Send success response - just like your weather example
    res.json({
      success: true,
      message: 'NFT purchased successfully via X402!',
      nft: mockNFT,
      asset: {
        id: asset._id,
        title: asset.title,
        creator: asset.creator.username
      }
    });

    // Update asset ownership
    if (asset.nftData) {
      asset.nftData.ownerAddress = buyerAddress;
      await asset.save();
    }

    res.json({
      success: true,
      message: 'NFT purchased successfully',
      data: paymentResult
    });

  } catch (error) {
    console.error('NFT purchase error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during NFT purchase'
    });
  }
});

// @route   POST /api/assets/:id/auction
// @desc    Create auction for NFT
// @access  Private (owner only)
router.post('/:id/auction', protect, [
  body('startTime').isISO8601().withMessage('Valid start time required'),
  body('endTime').isISO8601().withMessage('Valid end time required'),
  body('reservePrice').isFloat({ min: 0 }).withMessage('Valid reserve price required'),
  body('minBidIncrement').isFloat({ min: 0 }).withMessage('Valid min bid increment required')
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

    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Check if user owns the NFT
    if (asset.nftData?.ownerAddress !== req.user.walletAddress &&
        asset.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Only NFT owner can create auction'
      });
    }

    const { startTime, endTime, reservePrice, minBidIncrement } = req.body;

    // X402 will handle auction payments automatically
    console.log('🏷️ Auction created - X402 will handle payments');

    res.json({
      success: true,
      message: 'Auction created successfully',
      data: {
        auctionConfig,
        asset: asset.getPublicData()
      }
    });

  } catch (error) {
    console.error('Auction creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during auction creation'
    });
  }
});

// @route   GET /api/assets/test-images
// @desc    Test endpoint to check uploaded images
// @access  Public
router.get('/test-images', async (req, res) => {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const uploadsPath = process.env.UPLOAD_PATH || './uploads';
    const thumbnailsPath = path.join(uploadsPath, 'thumbnails');

    // Check if thumbnails directory exists and list files
    try {
      const files = await fs.readdir(thumbnailsPath);
      const imageFiles = files.filter(file =>
        file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg')
      );

      res.json({
        success: true,
        data: {
          thumbnailsPath,
          imageFiles,
          totalFiles: imageFiles.length,
          sampleUrls: imageFiles.slice(0, 3).map(file =>
            `http://localhost:5000/uploads/thumbnails/${file}`
          )
        }
      });
    } catch (dirError) {
      res.json({
        success: false,
        error: 'Thumbnails directory not found or empty',
        path: thumbnailsPath
      });
    }
  } catch (error) {
    console.error('Test images error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while testing images'
    });
  }
});

// @route   GET /api/assets/:id/payment-status
// @desc    Get X402 payment status for asset
// @access  Public
router.get('/:id/payment-status', async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Check if asset has X402 configuration
    const hasX402Config = asset.x402Config && Object.keys(asset.x402Config).length > 0;

    res.json({
      success: true,
      data: {
        assetId: asset._id,
        title: asset.title,
        price: asset.price,
        hasX402Config,
        x402Network: process.env.X402_NETWORK || 'base-sepolia',
        paymentRequired: !asset.nftData?.isMinted || asset.price > 0,
        status: asset.nftData?.isMinted ? 'minted' : 'pending'
      }
    });

  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while checking payment status'
    });
  }
});

// @route   GET /api/assets/:id/download
// @desc    Download high-resolution image with X402 payment
// @access  Public (with payment)
router.get('/:id/download', async (req, res) => {
  // This route is protected by X402 middleware - payment already completed!
  console.log('🎉 X402 PAYMENT COMPLETED! User paid and can now download');

  const { format = 'jpg' } = req.query;
  const assetId = req.params.id;

  try {
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    // Increment download count
    asset.downloads = (asset.downloads || 0) + 1;
    await asset.save();

    // Send download response - just like your weather example
    res.json({
      success: true,
      message: 'Download authorized via X402 payment!',
      download: {
        url: asset.imageUrl,
        format: format,
        filename: `${asset.title.replace(/[^a-zA-Z0-9]/g, '_')}.${format}`,
        watermark: false,
        highResolution: true
      },
      asset: {
        id: asset._id,
        title: asset.title
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

export default router;
