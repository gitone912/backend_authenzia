import express from 'express';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import { protect, optionalAuth } from '../middleware/auth.js';
import AIService from '../utils/aiService.js';
import ImageProcessor from '../utils/imageProcessor.js';
import Asset from '../models/Asset.js';

const router = express.Router();

// Initialize services
const aiService = new AIService();
const imageProcessor = new ImageProcessor();

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB for AI processing
    files: 2 // Allow up to 2 images for comparison
  },
  fileFilter: (req, file, cb) => {
    // Only accept image files for AI processing
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for AI processing'), false);
    }
  }
});

/**
 * @swagger
 * /ai/compare:
 *   post:
 *     summary: Compare two images using AI and local hashing
 *     description: Compare two images for similarity using both AI analysis and local perceptual hashing
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - images
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 minItems: 2
 *                 maxItems: 2
 *                 description: Two image files to compare (max 5MB each)
 *     responses:
 *       200:
 *         description: Image comparison completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     comparison:
 *                       type: object
 *                       properties:
 *                         isDuplicate:
 *                           type: boolean
 *                           description: Whether images are considered duplicates
 *                         confidence:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 1
 *                           description: Confidence score of the comparison
 *                         similarity:
 *                           type: number
 *                           minimum: 0
 *                           maximum: 1
 *                           description: Similarity score between images
 *                         aiMessage:
 *                           type: string
 *                           description: AI analysis message
 *                         localComparison:
 *                           type: object
 *                           description: Local hashing comparison results
 *                         aiResult:
 *                           type: object
 *                           description: AI analysis results
 *                     images:
 *                       type: object
 *                       properties:
 *                         image1:
 *                           type: object
 *                           properties:
 *                             filename:
 *                               type: string
 *                             size:
 *                               type: number
 *                             mimetype:
 *                               type: string
 *                         image2:
 *                           type: object
 *                           properties:
 *                             filename:
 *                               type: string
 *                             size:
 *                               type: number
 *                             mimetype:
 *                               type: string
 *       400:
 *         description: Validation error or wrong number of images
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
router.post('/compare', upload.array('images', 2), [
  body('images')
    .custom((value, { req }) => {
      if (!req.files || req.files.length !== 2) {
        throw new Error('Exactly 2 images are required for comparison');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.files || req.files.length !== 2) {
      return res.status(400).json({
        success: false,
        error: 'Exactly 2 images are required for comparison'
      });
    }

    const [image1, image2] = req.files;

    // Compare images using AI and local hashing
    const comparison = await aiService.compareImagesWithAI(
      image1.buffer,
      image2.buffer
    );

    res.json({
      success: true,
      data: {
        comparison: {
          isDuplicate: comparison.combinedResult.isDuplicate,
          confidence: comparison.combinedResult.confidence,
          similarity: comparison.combinedResult.similarity,
          aiMessage: comparison.combinedResult.aiMessage,
          localComparison: comparison.localComparison,
          aiResult: comparison.aiResult
        },
        images: {
          image1: {
            filename: image1.originalname,
            size: image1.size,
            mimetype: image1.mimetype
          },
          image2: {
            filename: image2.originalname,
            size: image2.size,
            mimetype: image2.mimetype
          }
        }
      }
    });

  } catch (error) {
    console.error('Image comparison error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during image comparison'
    });
  }
});

// @route   POST /api/ai/check-duplicate
// @desc    Check if uploaded image is duplicate of existing assets
// @access  Private
router.post('/check-duplicate', protect, upload.single('image'), [
  body('image')
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('Image file is required');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image uploaded'
      });
    }

    // Get existing assets for comparison (limit for performance)
    const existingAssets = await Asset.find({
      'originalFile.hash': { $exists: true },
      creator: { $ne: req.user._id }, // Don't check against user's own assets
      status: 'published',
      isPublic: true
    }).limit(100);

    if (existingAssets.length === 0) {
      return res.json({
        success: true,
        data: {
          hasDuplicates: false,
          duplicates: [],
          totalChecked: 0,
          message: 'No existing assets to compare against'
        }
      });
    }

    // Check for duplicates using AI
    const duplicateCheck = await aiService.checkForDuplicates(
      req.file.buffer,
      existingAssets
    );

    res.json({
      success: true,
      data: {
        hasDuplicates: duplicateCheck.hasDuplicates,
        duplicates: duplicateCheck.duplicates,
        totalChecked: duplicateCheck.totalChecked,
        message: duplicateCheck.hasDuplicates 
          ? 'Duplicate content detected' 
          : 'No duplicates found'
      }
    });

  } catch (error) {
    console.error('Duplicate check error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during duplicate check'
    });
  }
});

// @route   POST /api/ai/analyze
// @desc    Analyze image content and generate suggestions
// @access  Private
router.post('/analyze', protect, upload.single('image'), [
  body('image')
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('Image file is required');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image uploaded'
      });
    }

    // Analyze image content using AI
    const contentAnalysis = await aiService.analyzeImageContent(req.file.buffer);

    // Validate content appropriateness
    const contentValidation = await aiService.validateImageContent(req.file.buffer);

    res.json({
      success: true,
      data: {
        analysis: contentAnalysis,
        validation: contentValidation,
        suggestions: {
          tags: contentAnalysis.tags || [],
          category: contentAnalysis.category || 'other',
          description: contentAnalysis.description || '',
          suggestedPrice: contentAnalysis.suggestedPrice || '10-50',
          isAppropriate: contentValidation.isAppropriate,
          confidence: contentValidation.confidence
        }
      }
    });

  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during image analysis'
    });
  }
});

// @route   POST /api/ai/validate
// @desc    Validate image content for appropriateness
// @access  Private
router.post('/validate', protect, upload.single('image'), [
  body('image')
    .custom((value, { req }) => {
      if (!req.file) {
        throw new Error('Image file is required');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image uploaded'
      });
    }

    // Validate image content
    const validation = await aiService.validateImageContent(req.file.buffer);

    res.json({
      success: true,
      data: {
        validation: {
          isAppropriate: validation.isAppropriate,
          confidence: validation.confidence,
          flags: validation.flags || [],
          reason: validation.reason || '',
          recommendation: validation.isAppropriate 
            ? 'Content is appropriate for the platform' 
            : 'Content may not be appropriate for the platform'
        }
      }
    });

  } catch (error) {
    console.error('Content validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during content validation'
    });
  }
});

// @route   GET /api/ai/similar/:assetId
// @desc    Find similar assets to a given asset
// @access  Public
router.get('/similar/:assetId', optionalAuth, async (req, res) => {
  try {
    const { assetId } = req.params;
    const { limit = 10 } = req.query;

    // Get the target asset
    const targetAsset = await Asset.findById(assetId);
    if (!targetAsset) {
      return res.status(404).json({
        success: false,
        error: 'Asset not found'
      });
    }

    if (!targetAsset.originalFile || !targetAsset.originalFile.hash) {
      return res.status(400).json({
        success: false,
        error: 'Asset does not have image data for similarity search'
      });
    }

    // Get other assets with image hashes
    const similarAssets = await Asset.find({
      _id: { $ne: assetId },
      'originalFile.hash': { $exists: true },
      status: 'published',
      isPublic: true,
      isApproved: true
    }).limit(parseInt(limit));

    if (similarAssets.length === 0) {
      return res.json({
        success: true,
        data: {
          similarAssets: [],
          message: 'No similar assets found'
        }
      });
    }

    // For now, return assets in the same category
    // In a full implementation, you would use AI to find truly similar images
    const categorySimilar = similarAssets.filter(asset => 
      asset.category === targetAsset.category
    );

    res.json({
      success: true,
      data: {
        targetAsset: {
          _id: targetAsset._id,
          title: targetAsset.title,
          category: targetAsset.category
        },
        similarAssets: categorySimilar.map(asset => ({
          _id: asset._id,
          title: asset.title,
          category: asset.category,
          thumbnail: asset.thumbnail,
          price: asset.price,
          creator: asset.creator,
          similarity: 'category_match' // Placeholder for actual similarity score
        })),
        totalFound: categorySimilar.length
      }
    });

  } catch (error) {
    console.error('Find similar assets error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error while finding similar assets'
    });
  }
});

// @route   POST /api/ai/batch-compare
// @desc    Compare multiple images in batch
// @access  Private
router.post('/batch-compare', protect, upload.array('images', 10), [
  body('images')
    .custom((value, { req }) => {
      if (!req.files || req.files.length < 2) {
        throw new Error('At least 2 images are required for batch comparison');
      }
      if (req.files.length > 10) {
        throw new Error('Maximum 10 images allowed for batch comparison');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    if (!req.files || req.files.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 images are required for batch comparison'
      });
    }

    const images = req.files;
    const comparisons = [];

    // Compare each pair of images
    for (let i = 0; i < images.length; i++) {
      for (let j = i + 1; j < images.length; j++) {
        try {
          const comparison = await aiService.compareImagesWithAI(
            images[i].buffer,
            images[j].buffer
          );

          comparisons.push({
            image1: {
              filename: images[i].originalname,
              index: i
            },
            image2: {
              filename: images[j].originalname,
              index: j
            },
            result: comparison.combinedResult
          });
        } catch (error) {
          console.error(`Failed to compare images ${i} and ${j}:`, error);
          comparisons.push({
            image1: { filename: images[i].originalname, index: i },
            image2: { filename: images[j].originalname, index: j },
            result: { error: 'Comparison failed' }
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        totalImages: images.length,
        totalComparisons: comparisons.length,
        comparisons,
        summary: {
          duplicates: comparisons.filter(c => c.result.isDuplicate).length,
          unique: comparisons.filter(c => !c.result.isDuplicate).length
        }
      }
    });

  } catch (error) {
    console.error('Batch comparison error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during batch comparison'
    });
  }
});

export default router;
