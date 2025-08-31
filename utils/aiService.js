import { Groq } from 'groq-sdk';
import ImageProcessor from './imageProcessor.js';
import crypto from 'crypto';

// Optional imports for advanced duplicate detection
let phash, tf;
try {
  // Use a more lightweight alternative to phash
  // phash = await import('phash');
  console.log('⚠️ pHash library disabled (using SHA-256 only)');
} catch (error) {
  console.warn('⚠️ pHash library not available:', error.message);
}

try {
  // Disable TensorFlow for now to reduce complexity
  // tf = await import('@tensorflow/tfjs-node');
  console.log('⚠️ TensorFlow.js disabled (using basic comparison)');
} catch (error) {
  console.warn('⚠️ TensorFlow.js not available:', error.message);
}

export class AIService {
  constructor() {
    this.groq = new Groq({
      apiKey: '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'
    });
    this.imageProcessor = new ImageProcessor();
  }

  // Compare two images using Groq AI
  async compareImagesWithAI(image1Buffer, image2Buffer) {
    try {
      // Convert images to base64 data URLs
      const image1DataUrl = `data:image/png;base64,${image1Buffer.toString('base64')}`;
      const image2DataUrl = `data:image/png;base64,${image2Buffer.toString('base64')}`;

      const chatCompletion = await this.groq.chat.completions.create({
        "messages": [
          {
            "role": "system",
            "content": "you are an image agent , which compares two images and check wether both are same or not\nreturn response in json only\neg : { \"result\": true, \"message\": \"Images are identical\" }"
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "Please compare these two images and determine if they are similar or identical."
              },
              {
                "type": "image_url",
                "image_url": {
                  "url": image1DataUrl
                }
              },
              {
                "type": "image_url",
                "image_url": {
                  "url": image2DataUrl
                }
              }
            ]
          }
        ],
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "temperature": 1,
        "max_completion_tokens": 1024,
        "top_p": 1,
        "stream": false,
        "response_format": {
          "type": "json_object"
        },
        "stop": null
      });

      const aiResponse = chatCompletion.choices[0].message.content;
      const parsedResponse = JSON.parse(aiResponse);

      // Also perform local image hashing for comparison
      const localComparison = await this.imageProcessor.compareImages(image1Buffer, image2Buffer);

      return {
        aiResult: parsedResponse,
        localComparison,
        combinedResult: {
          isDuplicate: parsedResponse.result || localComparison.isSimilar,
          confidence: this.calculateConfidence(parsedResponse, localComparison),
          aiMessage: parsedResponse.message,
          similarity: localComparison.similarity
        }
      };

    } catch (error) {
      console.error('AI comparison failed:', error);
      
      // Fallback to local comparison only
      try {
        const localComparison = await this.imageProcessor.compareImages(image1Buffer, image2Buffer);
        return {
          aiResult: null,
          localComparison,
          combinedResult: {
            isDuplicate: localComparison.isSimilar,
            confidence: localComparison.similarity,
            aiMessage: 'AI service unavailable, using local comparison',
            similarity: localComparison.similarity
          }
        };
      } catch (localError) {
        throw new Error(`Both AI and local comparison failed: ${error.message}`);
      }
    }
  }

  // Check if uploaded image is duplicate of existing assets
  async checkForDuplicates(newImageBuffer, existingAssets) {
    try {
      const duplicateResults = [];
      
      for (const asset of existingAssets) {
        try {
          // Get the original file buffer for comparison
          const existingImageBuffer = await this.getAssetImageBuffer(asset.originalFile.path);
          
          if (existingImageBuffer) {
            const comparison = await this.compareImagesWithAI(newImageBuffer, existingImageBuffer);
            
            if (comparison.combinedResult.isDuplicate) {
              duplicateResults.push({
                assetId: asset._id,
                assetTitle: asset.title,
                creator: asset.creator,
                similarity: comparison.combinedResult.similarity,
                confidence: comparison.combinedResult.confidence,
                aiMessage: comparison.combinedResult.aiMessage
              });
            }
          }
        } catch (error) {
          console.error(`Failed to compare with asset ${asset._id}:`, error);
        }
      }

      return {
        hasDuplicates: duplicateResults.length > 0,
        duplicates: duplicateResults,
        totalChecked: existingAssets.length
      };

    } catch (error) {
      throw new Error(`Duplicate check failed: ${error.message}`);
    }
  }

  // Get image buffer from file path
  async getAssetImageBuffer(filePath) {
    try {
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(filePath);
      return buffer;
    } catch (error) {
      console.error(`Failed to read image file: ${filePath}`, error);
      return null;
    }
  }

  // Calculate confidence score based on AI and local results
  calculateConfidence(aiResult, localComparison) {
    let confidence = 0;
    
    // AI confidence (if available)
    if (aiResult && aiResult.result !== undefined) {
      confidence += aiResult.result ? 0.6 : 0.4;
    }
    
    // Local comparison confidence
    confidence += localComparison.similarity * 0.4;
    
    return Math.min(confidence, 1.0);
  }

  // Analyze image content and generate tags
  async analyzeImageContent(imageBuffer) {
    try {
      const imageDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      const chatCompletion = await this.groq.chat.completions.create({
        "messages": [
          {
            "role": "system",
            "content": "You are an image analysis expert. Analyze the image and provide relevant tags, category, and description. Return response in JSON format only: {\"tags\": [\"tag1\", \"tag2\"], \"category\": \"category\", \"description\": \"brief description\", \"suggestedPrice\": \"price range\"}"
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "Please analyze this image and provide relevant information for a digital asset marketplace."
              },
              {
                "type": "image_url",
                "image_url": {
                  "url": imageDataUrl
                }
              }
            ]
          }
        ],
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "temperature": 0.7,
        "max_completion_tokens": 512,
        "top_p": 1,
        "stream": false,
        "response_format": {
          "type": "json_object"
        }
      });

      const analysis = chatCompletion.choices[0].message.content;
      return JSON.parse(analysis);

    } catch (error) {
      console.error('Image analysis failed:', error);
      
      // Return default analysis
      return {
        tags: ['digital-art', 'creative'],
        category: 'digital-art',
        description: 'Digital artwork',
        suggestedPrice: '10-50'
      };
    }
  }

  // Validate image content for inappropriate material
  async validateImageContent(imageBuffer) {
    try {
      const imageDataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

      const chatCompletion = await this.groq.chat.completions.create({
        "messages": [
          {
            "role": "system",
            "content": "You are a content moderation expert. Check if the image contains inappropriate, offensive, or NSFW content. Return response in JSON format only: {\"isAppropriate\": true/false, \"confidence\": 0.0-1.0, \"flags\": [\"flag1\", \"flag2\"], \"reason\": \"explanation\"}"
          },
          {
            "role": "user",
            "content": [
              {
                "type": "text",
                "text": "Please check if this image is appropriate for a general audience marketplace."
              },
              {
                "type": "image_url",
                "image_url": {
                  "url": imageDataUrl
                }
              }
            ]
          }
        ],
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "temperature": 0.3,
        "max_completion_tokens": 256,
        "top_p": 1,
        "stream": false,
        "response_format": {
          "type": "json_object"
        }
      });

      const validation = chatCompletion.choices[0].message.content;
      return JSON.parse(validation);

    } catch (error) {
      console.error('Content validation failed:', error);
      
      // Return safe default
      return {
        isAppropriate: true,
        confidence: 0.5,
        flags: [],
        reason: 'Validation service unavailable'
      };
    }
  }

  // Generate SHA-256 hash for content verification
  generateSHA256Hash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Generate perceptual hash using pHash
  async generatePerceptualHash(imageBuffer) {
    if (!phash) {
      console.warn('⚠️ pHash not available, falling back to SHA-256');
      return this.generateSHA256Hash(imageBuffer);
    }

    try {
      // Convert buffer to temporary file for pHash processing
      const tempPath = `/tmp/temp_${Date.now()}.png`;
      const fs = await import('fs/promises');
      await fs.writeFile(tempPath, imageBuffer);

      const hash = await phash.hash(tempPath);

      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});

      return hash;
    } catch (error) {
      console.error('Perceptual hashing failed:', error);
      return this.generateSHA256Hash(imageBuffer);
    }
  }

  // Calculate Hamming distance between two hashes
  hammingDistance(hash1, hash2) {
    if (hash1.length !== hash2.length) {
      return Infinity;
    }

    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }
    return distance;
  }

  // Advanced duplicate detection using multiple methods
  async detectDuplicates(imageBuffer, existingAssets) {
    const results = {
      isDuplicate: false,
      confidence: 0,
      matches: [],
      methods: {
        sha256: false,
        perceptual: false,
        ai: false
      }
    };

    try {
      // Method 1: SHA-256 exact match
      const sha256Hash = this.generateSHA256Hash(imageBuffer);
      const exactMatches = existingAssets.filter(asset =>
        asset.originalFile?.hash === sha256Hash
      );

      if (exactMatches.length > 0) {
        results.isDuplicate = true;
        results.confidence = 1.0;
        results.methods.sha256 = true;
        results.matches = exactMatches.map(asset => ({
          assetId: asset._id,
          method: 'sha256',
          confidence: 1.0,
          reason: 'Exact hash match'
        }));
        return results;
      }

      // Method 2: Perceptual hashing
      if (phash) {
        const perceptualHash = await this.generatePerceptualHash(imageBuffer);
        const perceptualMatches = [];

        for (const asset of existingAssets) {
          if (asset.perceptualHash) {
            const distance = this.hammingDistance(perceptualHash, asset.perceptualHash);
            const similarity = 1 - (distance / Math.max(perceptualHash.length, asset.perceptualHash.length));

            if (similarity > 0.85) { // 85% similarity threshold
              perceptualMatches.push({
                assetId: asset._id,
                method: 'perceptual',
                confidence: similarity,
                reason: `Perceptual similarity: ${(similarity * 100).toFixed(1)}%`
              });
            }
          }
        }

        if (perceptualMatches.length > 0) {
          results.isDuplicate = true;
          results.confidence = Math.max(...perceptualMatches.map(m => m.confidence));
          results.methods.perceptual = true;
          results.matches.push(...perceptualMatches);
        }
      }

      // Method 3: AI-based comparison (for top matches)
      if (results.matches.length > 0) {
        // Use AI to verify the top match
        const topMatch = results.matches.reduce((prev, current) =>
          prev.confidence > current.confidence ? prev : current
        );

        const matchedAsset = existingAssets.find(asset =>
          asset._id.toString() === topMatch.assetId.toString()
        );

        if (matchedAsset && matchedAsset.originalFile?.path) {
          try {
            const fs = await import('fs/promises');
            const existingImageBuffer = await fs.readFile(matchedAsset.originalFile.path);
            const aiComparison = await this.compareImagesWithAI(imageBuffer, existingImageBuffer);

            if (aiComparison.result) {
              results.methods.ai = true;
              results.confidence = Math.max(results.confidence, 0.9);
              topMatch.reason += ' (AI confirmed)';
            }
          } catch (error) {
            console.warn('AI comparison failed:', error.message);
          }
        }
      }

      return results;

    } catch (error) {
      console.error('Duplicate detection failed:', error);
      return {
        isDuplicate: false,
        confidence: 0,
        matches: [],
        error: error.message,
        methods: { sha256: false, perceptual: false, ai: false }
      };
    }
  }

  // Store perceptual hash in asset
  async processImageForDuplicateDetection(imageBuffer) {
    const sha256Hash = this.generateSHA256Hash(imageBuffer);
    let perceptualHash = null;

    if (phash) {
      try {
        perceptualHash = await this.generatePerceptualHash(imageBuffer);
      } catch (error) {
        console.warn('Failed to generate perceptual hash:', error.message);
      }
    }

    return {
      sha256Hash,
      perceptualHash,
      processedAt: new Date()
    };
  }
}

export default AIService;
