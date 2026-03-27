const QRCode = require('qrcode');

class QrCodeService {
  /**
   * Generate QR code as base64 string
   * @param {string} text - Text to encode in QR code
   * @param {object} options - QR code options
   * @returns {Promise<string>} Base64 encoded QR code (without data URI prefix)
   */
  async generateQrCodeBase64(text, options = {}) {
    try {
      if (!text) {
        throw new Error('Text is required for QR code generation');
      }

      const defaultOptions = {
        type: 'image/png',
        quality: 1,
        margin: 1,
        width: 300,
        errorCorrectionLevel: 'M',
        ...options
      };

      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(text, defaultOptions);
      
      // Extract base64 part (remove "data:image/png;base64," prefix)
      const base64 = dataUrl.split(',')[1];
      
      return base64;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }

  /**
   * Generate QR code with data URI prefix (ready to use in img src)
   * @param {string} text - Text to encode
   * @returns {Promise<string>} Complete data URI
   */
  async generateQrCodeDataUri(text, options = {}) {
    const base64 = await this.generateQrCodeBase64(text, options);
    return `data:image/png;base64,${base64}`;
  }

  /**
   * Generate MyInvois QR code URL
   * @param {string} uuid - MyInvois UUID
   * @param {string} longId - MyInvois Long ID
   * @returns {Promise<string>} QR code as data URI
   */
  async generateMyInvoisQr(uuid, longId) {
    if (!uuid || !longId) {
      throw new Error('Both UUID and Long ID are required for MyInvois QR');
    }

    const qrUrl = `https://myinvois.hasil.gov.my/${uuid}/share/${longId}`;
    return await this.generateQrCodeDataUri(qrUrl);
  }
}

module.exports = new QrCodeService();
