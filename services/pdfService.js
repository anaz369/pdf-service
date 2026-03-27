const sharp = require('sharp');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

class PdfService {
  constructor() {
    // Initialize cache (TTL: 1 hour, check period: 10 minutes)
    this.cache = new NodeCache({ 
      stdTTL: 3600, 
      checkperiod: 600,
      useClones: false // Don't clone buffers for performance
    });

    // Semaphores for concurrent download prevention
    this.downloadSemaphores = new Map();
  }

  /**
   * Get URL hash for cache key
   */
  getUrlHash(url) {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Download image from URL
   */
  async downloadImage(imageUrl) {
    return new Promise((resolve, reject) => {
      const protocol = imageUrl.startsWith('https') ? https : http;
      
      const request = protocol.get(imageUrl, {
        headers: {
          'User-Agent': 'PDF-Generator/1.0',
          'Accept': 'image/jpeg,image/jpg,image/png,image/gif,image/*,*/*'
        }
      }, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });

      request.on('error', reject);
      request.setTimeout(15000, () => {
        request.destroy();
        reject(new Error('Image download timeout'));
      });
    });
  }

  /**
   * Process image with high quality (replaces GetHighQualityImageBytes from C#)
   * @param {string} imageUrl - URL of the image
   * @param {number} opacity - Opacity value (0-1)
   * @returns {Promise<Buffer>} Processed image buffer
   */
  async getHighQualityImageBytes(imageUrl, opacity = 1.0) {
    if (!imageUrl) return null;

    const cacheKey = `hq_image_${this.getUrlHash(imageUrl)}_${opacity.toFixed(2)}`;

    // Check cache first
    const cachedImage = this.cache.get(cacheKey);
    if (cachedImage) {
      console.log(`Using cached image for URL: ${imageUrl}`);
      return cachedImage;
    }

    // Use semaphore to prevent multiple downloads of same image
    const semaphoreKey = imageUrl;
    if (!this.downloadSemaphores.has(semaphoreKey)) {
      this.downloadSemaphores.set(semaphoreKey, Promise.resolve());
    }

    const semaphore = this.downloadSemaphores.get(semaphoreKey);
    
    return semaphore.then(async () => {
      // Double-check cache after acquiring semaphore
      const cachedImage = this.cache.get(cacheKey);
      if (cachedImage) return cachedImage;

      try {
        console.log(`Downloading image from URL: ${imageUrl}`);
        
        const imageBuffer = await this.downloadImage(imageUrl);
        let processedBuffer;

        // Process image with Sharp
        let image = sharp(imageBuffer);
        const metadata = await image.metadata();

        console.log(`Image format: ${metadata.format}, Size: ${metadata.width}x${metadata.height}`);

        // Handle PNG - convert to JPEG with white background
        if (metadata.format === 'png') {
          console.log('Converting PNG to JPEG with white background');

          // Apply opacity if needed
          if (opacity < 1.0) {
            // Create a semi-transparent version
            image = image.composite([{
              input: Buffer.from([255, 255, 255, Math.round(255 * opacity)]),
              raw: { width: 1, height: 1, channels: 4 },
              tile: true,
              blend: 'dest-in'
            }]);
          }

          // Flatten with white background
          image = image.flatten({ background: '#ffffff' });
        } else if (opacity < 1.0) {
          // For JPEG, reduce brightness to simulate opacity
          image = image.modulate({ brightness: opacity });
        }

        // Resize if too large (A4 is ~2480x3508 at 300dpi)
        if (metadata.width > 2480 || metadata.height > 3508) {
          const scaleWidth = 2480 / metadata.width;
          const scaleHeight = 3508 / metadata.height;
          const scale = Math.min(scaleWidth, scaleHeight);
          
          const newWidth = Math.round(metadata.width * scale);
          const newHeight = Math.round(metadata.height * scale);

          image = image.resize(newWidth, newHeight, {
            fit: 'inside',
            withoutEnlargement: true
          });

          console.log(`Resized to ${newWidth}x${newHeight}`);
        }

        // Convert to JPEG with high quality
        processedBuffer = await image
          .jpeg({ quality: 95, mozjpeg: true })
          .toBuffer();

        // Cache the processed image
        this.cache.set(cacheKey, processedBuffer);

        console.log(`Processed image. Size: ${processedBuffer.length} bytes`);

        return processedBuffer;

      } catch (error) {
        console.error(`Error processing image from ${imageUrl}:`, error);
        throw error;
      } finally {
        // Clean up semaphore
        this.downloadSemaphores.delete(semaphoreKey);
      }
    });
  }

  /**
   * Generate header HTML with image
   */
  async headerGenerate(imageUrl) {
    try {
      const cacheKey = `header_${this.getUrlHash(imageUrl)}`;
      const cachedHeader = this.cache.get(cacheKey);
      if (cachedHeader) return cachedHeader;

      const imageBytes = await this.getHighQualityImageBytes(imageUrl);
      if (!imageBytes) {
        return `<style>#header, #footer { padding: 0 !important; }</style>
                <div style='height: 80px; background-color: #f8f9fa; display: flex; align-items: center; justify-content: center; margin: 0; padding: 0;'>
                  Header Image not found
                </div>`;
      }

      const base64 = imageBytes.toString('base64');
      const headerHtml = `<style>#header, #footer { padding: 0 !important; }</style>
        <div style='width: 100%; margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; background-color: white; -webkit-print-color-adjust: exact;'>
          <img src='data:image/jpeg;base64,${base64}' style='max-width: 100%; height: auto; margin: 0; padding: 0;'>
        </div>`;

      this.cache.set(cacheKey, headerHtml);
      return headerHtml;

    } catch (error) {
      console.error('Error generating header:', error);
      return `<style>#header, #footer { padding: 0 !important; }</style>
              <div style='height: 80px; background-color: #f8f9fa; display: flex; align-items: center; justify-content: center;'>
                Header unavailable
              </div>`;
    }
  }

  /**
   * Generate footer HTML with image and page numbers
   */
  async footerGenerate(imageUrl, pdfRequest = null) {
    try {
      const cacheKey = `footer_${this.getUrlHash(imageUrl)}`;
      const cachedFooter = this.cache.get(cacheKey);
      if (cachedFooter) return cachedFooter;

      const imageBytes = await this.getHighQualityImageBytes(imageUrl);
      if (!imageBytes) {
        return this.getPageNumberOnlyFooter();
      }

      const base64 = imageBytes.toString('base64');

      const footerNoteMy = `
        <div class='footer-note'>
          Lembaga Hasil Dalam Negeri Malaysia (LHDNM).
        </div>
      `;

      // ✅ conditionally include footer note
      const footerNoteSection =
        pdfRequest?.MyInvoisDocument?.myinvois ? footerNoteMy : '';

      const footerHtml = `
        <style>
          #header, #footer { padding: 0 !important; margin: 0 !important; width: 100% !important; }
          * { box-sizing: border-box; }
          .footer-container { width: 210mm; margin: 0; padding: 0; position: relative; background: transparent; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page-number-bar { position: absolute; top: 0; right: 0; z-index: 20; background: rgba(255, 255, 255, 0.95); padding: 4px 12px; font-family: Arial, sans-serif; font-size: 9px; font-weight: bold; color: #333; border-radius: 0 0 0 8px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); border: 1px solid #e0e0e0; border-top: none; border-right: none; }
          .footer-image-wrapper { width: 100%; margin: 0; padding: 0; overflow: hidden; }
          .footer-img { width: 100%; height: auto; display: block; margin: 0; padding: 0; object-fit: cover; max-width: none; }
          .footer-note { width: 100%; text-align: center; font-family: Arial, sans-serif; font-size: 7px; color: #666; font-style: italic; padding: 3px 0; background: rgba(255, 255, 255, 0.9); border-top: 1px solid #e0e0e0; margin-top: 2px; }
        </style>

        <div class='footer-container'>
          <div class='page-number-bar'>
            Page <span class='pageNumber'></span> of <span class='totalPages'></span>
          </div>

          <div class='footer-image-wrapper'>
            <img src='data:image/jpeg;base64,${base64}' class='footer-img' alt='Footer'>
          </div>

          ${footerNoteSection}
        </div>
      `;

      this.cache.set(cacheKey, footerHtml);
      return footerHtml;

    } catch (error) {
      console.error('Error generating footer:', error);
      return this.getPageNumberOnlyFooter();
    }
  }

  /**
   * Generate watermark CSS with base64 image
   */
  async generateWatermarkCss(imageUrl, opacity = 0.7) {
    try {
      const cacheKey = `watermark_${this.getUrlHash(imageUrl)}_${opacity.toFixed(2)}`;
      const cachedDataUri = this.cache.get(cacheKey);
      if (cachedDataUri) return cachedDataUri;

      const imageBytes = await this.getHighQualityImageBytes(imageUrl, opacity);
      if (!imageBytes) {
        console.warn('Watermark image bytes are NULL');
        return '';
      }

      const base64 = imageBytes.toString('base64');
      const dataUri = `data:image/jpeg;base64,${base64}`;

      console.log(`Generated watermark data URI with opacity ${opacity}. Length: ${dataUri.length}`);

      this.cache.set(cacheKey, dataUri);
      return dataUri;

    } catch (error) {
      console.error('Error generating watermark CSS:', error);
      return '';
    }
  }

  /**
   * Get page number only footer (fallback)
   */
  getPageNumberOnlyFooter() {
    return `<style>#header, #footer { padding: 0 !important; }</style>
      <div style='width: 100%; margin: 0; padding: 0; display: flex; align-items: center; justify-content: flex-end; background-color: white; border-top: 1px solid #ddd; -webkit-print-color-adjust: exact; font-family: Arial, sans-serif; font-size: 10px; color: #666; font-weight: 600; padding-right: 20px;'>
        Page <span class='pageNumber'></span> of <span class='totalPages'></span>
      </div>`;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.flushAll();
  }
}

module.exports = new PdfService();
