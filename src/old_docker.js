const puppeteer = require('puppeteer');

// ── Singleton browser ─────────────────────────────────────
// Stays alive between requests on a warm Lambda container.
// Saves ~2 seconds per request by skipping browser launch.
let cachedBrowser = null;
let requestCount  = 0;

// Recycle browser every 8 requests to prevent Chrome instability
// Chrome's --single-process mode corrupts state after ~10 requests
const MAX_REQUESTS_BEFORE_RECYCLE = 8;

async function getBrowser() {
  // Deep health check — isConnected() alone is not enough
  // Browser process can be alive but unresponsive after PDF generation
  if (cachedBrowser && cachedBrowser.isConnected()) {
    try {
      // Actually ping the browser — open and close a blank page
      const testPage = await cachedBrowser.newPage();
      await testPage.close();
      return cachedBrowser; // browser is truly alive
    } catch (e) {
      console.log('Browser health check failed — relaunching:', e.message);
      try { await cachedBrowser.close(); } catch (_) {}
      cachedBrowser = null;
    }
  }

  // Launch fresh browser
  console.log('Launching new browser instance...');
  cachedBrowser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/usr/local/bin/chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      '--hide-scrollbars',
      '--disable-notifications',
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--font-render-hinting=none'
    ],
    ignoreHTTPSErrors: true,
    timeout: 60000  // 60s timeout for cold start
  });

  console.log('Browser launched successfully');
  return cachedBrowser;
}

async function recycleBrowser() {
  try {
    if (cachedBrowser) await cachedBrowser.close();
  } catch (e) { /* ignore */ }
  cachedBrowser = null;
  requestCount  = 0;
  console.log('Browser recycled (max requests reached)');
}

// ── Handler ───────────────────────────────────────────────
exports.handler = async (event) => {

  // 1. Warmup ping — return immediately, keeps container alive
  // Also pre-launches browser so first real request is instant
  if (event.warmup || event.source === 'warmup') {
    console.log('Warmup ping received');
    await getBrowser();
    return { statusCode: 200, body: JSON.stringify({ status: 'warm' }) };
  }

  let page = null;

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { html, url, options = {} } = body;

    if (!html && !url) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Either html or url must be provided' })
      };
    }

    // 2. Recycle browser periodically to prevent Chrome memory/state issues
    requestCount++;
    console.log(`Request #${requestCount} of ${MAX_REQUESTS_BEFORE_RECYCLE} before recycle`);
    if (requestCount >= MAX_REQUESTS_BEFORE_RECYCLE) {
      await recycleBrowser();
    }

    // 3. Get browser (reuse or launch)
    const browser = await getBrowser();

    // 4. Create new page with timeouts
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    // 5. Block unnecessary resources for speed
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      // Block media files — base64 images in CSS still work
      if (type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });

    if (options.viewport) {
      await page.setViewport(options.viewport);
    }

    // 6. Load content
    // 'domcontentloaded' is faster than 'networkidle0'
    const waitStrategy = options.waitUntil || 'domcontentloaded';

    if (url) {
      console.log(`Loading URL: ${url}`);
      await page.goto(url, { waitUntil: waitStrategy, timeout: 15000 });
    } else {
      console.log('Setting HTML content...');
      await page.setContent(html, { waitUntil: waitStrategy, timeout: 15000 });
    }

    // 7. Generate PDF
    console.log('Generating PDF...');
    const pdfOptions = {
      format:              options.format      || 'A4',
      printBackground:     options.printBackground !== false,
      preferCSSPageSize:   options.preferCSSPageSize || false,
      landscape:           options.landscape   || false,
      displayHeaderFooter: options.displayHeaderFooter || false,
      headerTemplate:      options.headerTemplate || '<div></div>',
      footerTemplate:      options.footerTemplate || '<div></div>',
      margin:              options.margin || { top: '20px', right: '20px', bottom: '20px', left: '20px' },
      ...options
    };

    const pdf = await page.pdf(pdfOptions);
    console.log(`PDF generated: ${pdf.length} bytes | request #${requestCount}`);

    // 8. Close page — keep browser alive for next request
    await page.close();
    page = null;

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/pdf',
        'Content-Disposition':         `attachment; filename="${options.filename || 'document.pdf'}"`,
        'Access-Control-Allow-Origin': '*'
      },
      body:            pdf.toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('PDF generation error:', error.message);

    // Close page to prevent memory leak
    if (page) {
      try { await page.close(); } catch (e) {}
    }

    // If browser crashed — null it so next request relaunches fresh
    const browserCrashed = (
      error.message.includes('Target closed')  ||
      error.message.includes('broken pipe')    ||
      error.message.includes('Session closed') ||
      error.message.includes('Protocol error') ||
      error.message.includes('Timed out')
    );

    if (browserCrashed) {
      console.log('Browser crashed — will relaunch on next request');
      cachedBrowser = null;
      requestCount  = 0;
    }

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error:   'Failed to generate PDF',
        message: error.message
      })
    };
  }
};