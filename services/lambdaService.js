'use strict';

const axios = require('axios');

const LAMBDA_PDF_API =
  'https://hcpuerxkuc.execute-api.ap-south-1.amazonaws.com/default/puppeteer-pdf-generator';

/**
 * Send HTML + Puppeteer options to AWS Lambda and return a PDF buffer.
 *
 * @param {string} html      - Rendered HTML string
 * @param {object} options   - Puppeteer PDF options (format, margin, etc.)
 * @returns {Promise<Buffer>}
 */
async function callLambda(html, options) {
  const response = await axios.post(
    LAMBDA_PDF_API,
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
