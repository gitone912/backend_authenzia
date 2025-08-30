import sharp from 'sharp';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export class ImageProcessor {
  constructor() {
    this.uploadPath = process.env.UPLOAD_PATH || './uploads';
    this.watermarkText = process.env.WATERMARK_TEXT || 'SAMPLE';
  }

  // Generate QR code for payment
  async generateQRCode(paymentUrl, size = 200) {
    try {
      const qrCodeBuffer = await QRCode.toBuffer(paymentUrl, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      return qrCodeBuffer;
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  // Apply watermark to image
  async applyWatermark(imageBuffer, watermarkText = this.watermarkText) {
    try {
      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();
      
      // Create watermark SVG
      const watermarkSvg = `
        <svg width="${metadata.width}" height="${metadata.height}">
          <text x="50%" y="50%" text-anchor="middle" dy=".3em" 
                font-family="Arial, sans-serif" font-size="48" 
                font-weight="bold" fill="rgba(255,255,255,0.3)" 
                transform="rotate(-45, ${metadata.width/2}, ${metadata.height/2})">
            ${watermarkText}
          </text>
        </svg>
      `;

      // Apply watermark to the original image
      const watermarkedImage = await sharp(imageBuffer)
        .composite([{
          input: Buffer.from(watermarkSvg),
          top: 0,
          left: 0
        }])
        .png()
        .toBuffer();

      return watermarkedImage;
    } catch (error) {
      throw new Error(`Failed to apply watermark: ${error.message}`);
    }
  }

  // Create thumbnail from image
  async createThumbnail(imageBuffer, width = 300, height = 300) {
    try {
      const thumbnail = await sharp(imageBuffer)
        .resize(width, height, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      return thumbnail;
    } catch (error) {
      throw new Error(`Failed to create thumbnail: ${error.message}`);
    }
  }

  // Process uploaded image: create watermarked version, thumbnail, and QR code
  async processImage(imageBuffer, assetId, paymentUrl) {
    try {
      const filename = uuidv4();
      
      // Create directories if they don't exist
      await this.ensureDirectories();
      
      // Generate QR code
      const qrCodeBuffer = await this.generateQRCode(paymentUrl, 200);
      const qrCodePath = path.join(this.uploadPath, 'qrcodes', `${filename}_qr.png`);
      await fs.writeFile(qrCodePath, qrCodeBuffer);
      
      // Create thumbnail
      const thumbnailBuffer = await this.createThumbnail(imageBuffer);
      const thumbnailPath = path.join(this.uploadPath, 'thumbnails', `${filename}_thumb.jpg`);
      await fs.writeFile(thumbnailPath, thumbnailBuffer);
      
      // Apply watermark
      const watermarkedBuffer = await this.applyWatermark(imageBuffer);
      const watermarkedPath = path.join(this.uploadPath, 'watermarked', `${filename}_watermarked.png`);
      await fs.writeFile(watermarkedPath, watermarkedBuffer);
      
      // Save original (for future access after payment)
      const originalPath = path.join(this.uploadPath, 'originals', `${filename}_original.png`);
      await fs.writeFile(originalPath, imageBuffer);
      
      return {
        original: {
          filename: `${filename}_original.png`,
          path: originalPath,
          size: imageBuffer.length,
          mimetype: 'image/png'
        },
        watermarked: {
          filename: `${filename}_watermarked.png`,
          path: watermarkedPath,
          size: watermarkedBuffer.length,
          mimetype: 'image/png'
        },
        thumbnail: {
          filename: `${filename}_thumb.jpg`,
          path: thumbnailPath,
          size: thumbnailBuffer.length
        },
        qrCode: {
          filename: `${filename}_qr.png`,
          path: qrCodePath,
          paymentUrl
        }
      };
    } catch (error) {
      throw new Error(`Failed to process image: ${error.message}`);
    }
  }

  // Ensure upload directories exist
  async ensureDirectories() {
    const dirs = [
      this.uploadPath,
      path.join(this.uploadPath, 'originals'),
      path.join(this.uploadPath, 'watermarked'),
      path.join(this.uploadPath, 'thumbnails'),
      path.join(this.uploadPath, 'qrcodes')
    ];

    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }
    }
  }

  // Get image hash for duplicate detection
  async getImageHash(imageBuffer) {
    try {
      // Use Sharp to get image hash - resize to 8x8 and convert to grayscale
      const { data } = await sharp(imageBuffer)
        .resize(8, 8, { fit: 'cover' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Calculate perceptual hash (dHash variation)
      let hash = 0;
      let prevPixel = data[0];
      
      for (let i = 1; i < data.length; i++) {
        const currentPixel = data[i];
        if (currentPixel > prevPixel) {
          hash |= (1 << (i - 1));
        }
        prevPixel = currentPixel;
      }
      
      return hash.toString(16);
    } catch (error) {
      throw new Error(`Failed to generate image hash: ${error.message}`);
    }
  }

  // Compare two images for similarity
  async compareImages(image1Buffer, image2Buffer) {
    try {
      const hash1 = await this.getImageHash(image1Buffer);
      const hash2 = await this.getImageHash(image2Buffer);
      
      // Calculate Hamming distance
      const distance = this.hammingDistance(hash1, hash2);
      
      // For 64-bit hashes (8x8 images), max distance is 64
      // Similarity is inverse of normalized distance
      const maxDistance = 64;
      const similarity = 1 - (distance / maxDistance);
      
      return {
        hash1,
        hash2,
        distance,
        similarity,
        isSimilar: similarity > 0.85 // 85% similarity threshold (distance < 10)
      };
    } catch (error) {
      throw new Error(`Failed to compare images: ${error.message}`);
    }
  }

  // Calculate Hamming distance between two hex strings
  hammingDistance(str1, str2) {
    let distance = 0;
    const maxLength = Math.max(str1.length, str2.length);
    
    // Pad shorter string with zeros
    const paddedStr1 = str1.padEnd(maxLength, '0');
    const paddedStr2 = str2.padEnd(maxLength, '0');
    
    for (let i = 0; i < maxLength; i++) {
      if (paddedStr1[i] !== paddedStr2[i]) {
        distance++;
      }
    }
    
    return distance;
  }

  // Clean up temporary files
  async cleanupTempFiles(filePaths) {
    try {
      for (const filePath of filePaths) {
        try {
          await fs.unlink(filePath);
        } catch (error) {
          // File might not exist, continue
        }
      }
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
    }
  }
}

export default ImageProcessor;
