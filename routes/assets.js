import express from 'express';
import multer from 'multer';
import { protect, optionalAuth } from '../middleware/auth.js';
import Asset from '../models/Asset.js';
import User from '../models/User.js';
import ImageProcessor from '../utils/imageProcessor.js';
import AIService from '../utils/aiService.js';

const router = express.Router();

// Initialize services
const imageProcessor = new ImageProcessor();
const aiService = new AIService();

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
    
    // Validate required fields
    const errors = [];
    
    if (!title || title.length < 3 || title.length > 100) {
      errors.push({ path: 'title', msg: 'Title must be between 3 and 100 characters' });
    }
    
    if (!description || description.length < 10 || description.length > 1000) {
      errors.push({ path: 'description', msg: 'Description must be between 10 and 1000 characters' });
    }
    
    if (!category || !['digital-art', 'ui-design', 'photography', 'motion-graphics', 'documents', 'illustrations', '3d-models', 'audio', 'video', 'other'].includes(category)) {
      errors.push({ path: 'category', msg: 'Invalid category' });
    }
    
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      errors.push({ path: 'price', msg: 'Price must be a positive number' });
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Variables are already declared above, no need to redeclare

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

    // Check if user is a creator
    if (!req.user.isCreator) {
      return res.status(403).json({
        success: false,
        error: 'Only creators can upload assets'
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

        if (existingAssets.length > 0) {
          const duplicateCheck = await aiService.checkForDuplicates(req.file.buffer, existingAssets);
          
          if (duplicateCheck.hasDuplicates) {
            return res.status(400).json({
              success: false,
              error: 'Duplicate content detected',
              details: {
                message: 'This image appears to be similar to existing content on the platform',
                duplicates: duplicateCheck.duplicates
              }
            });
          }
        }

        // AI content analysis and validation
        const [contentAnalysis, contentValidation] = await Promise.all([
          aiService.analyzeImageContent(req.file.buffer),
          aiService.validateImageContent(req.file.buffer)
        ]);

        if (!contentValidation.isAppropriate) {
          return res.status(400).json({
            success: false,
            error: 'Content not appropriate for platform',
            details: contentValidation
          });
        }

        // Use AI suggestions if available
        const finalTags = parsedTags.length > 0 ? parsedTags : (contentAnalysis.tags || []);
        const finalCategory = category || contentAnalysis.category || 'other';
        const finalDescription = description || contentAnalysis.description;

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

    // Create asset record
    const asset = new Asset({
      title,
      description,
      creator: req.user._id,
      category,
      tags: parsedTags,
      price: parseFloat(price),
      license: license || 'personal',
      usageRights: usageRights || [],
      originalFile: {
        filename: processedFiles.original.filename,
        path: processedFiles.original.path,
        size: processedFiles.original.size,
        mimetype: processedFiles.original.mimetype,
        hash: imageHash
      },
      watermarkedFile: processedFiles.watermarked || null,
      thumbnail: processedFiles.thumbnail || null,
      qrCode: processedFiles.qrCode || null,
      aiVerified: true,
      duplicateCheck: {
        isDuplicate: false,
        similarAssets: [],
        checkedAt: new Date()
      }
    });

    await asset.save();

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
        price: price ? parseFloat(price) : undefined,
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

export default router;
