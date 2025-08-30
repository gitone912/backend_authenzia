import { Groq } from 'groq-sdk';
import ImageProcessor from './imageProcessor.js';

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
}

export default AIService;
