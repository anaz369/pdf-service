'use strict';

const axios = require('axios');

const PUPPETEER_SERVICE_URL =
  process.env.PUPPETEER_SERVICE_URL || 'http://localhost:3001';

console.log('[lambdaService] PUPPETEER_SERVICE_URL:', PUPPETEER_SERVICE_URL);
console.log('[lambdaService] process.env.PUPPETEER_SERVICE_URL:', process.env.PUPPETEER_SERVICE_URL);

/**
 * Send HTML + Puppeteer options to the Puppeteer service and return a PDF buffer.
 *
 * @param {string} html      - Rendered HTML string
 * @param {object} options   - Puppeteer PDF options (format, margin, etc.)
 * @returns {Promise<Buffer>}
 */
async function generatePdf(html, options) {
  const url = `${PUPPETEER_SERVICE_URL}/generate`;
  console.log('[generatePdf] Calling Puppeteer at:', url);
  const response = await axios.post(
    url,
    { html, options },
    {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    },
  );
  return Buffer.from(response.data);
}

module.exports = { generatePdf };
