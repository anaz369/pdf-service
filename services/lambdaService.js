'use strict';

const axios = require('axios');

const PUPPETEER_SERVICE_URL =
  process.env.PUPPETEER_SERVICE_URL || 'http://puppeteer-service:3001';

/**
 * Send HTML + Puppeteer options to the Puppeteer service and return a PDF buffer.
 *
 * @param {string} html      - Rendered HTML string
 * @param {object} options   - Puppeteer PDF options (format, margin, etc.)
 * @returns {Promise<Buffer>}
 */
async function callLambda(html, options) {
  const response = await axios.post(
    `${PUPPETEER_SERVICE_URL}/generate`,
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

module.exports = { callLambda };
