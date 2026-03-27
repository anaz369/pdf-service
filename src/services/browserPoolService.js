const puppeteer = require('puppeteer');
const genericPool = require('generic-pool');

class BrowserPoolService {
  constructor() {
    this.pool = null;
    this.isInitialized = false;
  }

  /**
   * Initialize browser pool
   */
  async initialize() {
    if (this.isInitialized) return;

    const minBrowsers = parseInt(process.env.BROWSER_POOL_MIN || '2');
    const maxBrowsers = parseInt(process.env.BROWSER_POOL_MAX || '5');
    const idleTimeout = parseInt(process.env.BROWSER_POOL_IDLE_TIMEOUT || '30000');

    console.log(`Initializing browser pool: min=${minBrowsers}, max=${maxBrowsers}`);

    const factory = {
      create: async () => {
        try {
          console.log('Creating new browser instance...');
          
          const launchOptions = {
            headless: process.env.PUPPETEER_HEADLESS !== 'false',
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu'
            ]
          };

          // Use custom Chrome path if specified (for cPanel deployments)
          if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
          }

          const browser = await puppeteer.launch(launchOptions);
          
          console.log('Browser instance created successfully');
          return browser;

        } catch (error) {
          console.error('Failed to create browser instance:', error);
          throw error;
        }
      },
      
      destroy: async (browser) => {
        try {
          console.log('Destroying browser instance...');
          await browser.close();
          console.log('Browser instance destroyed');
        } catch (error) {
          console.error('Error destroying browser:', error);
        }
      },
      
      validate: async (browser) => {
        try {
          return browser.isConnected();
        } catch {
          return false;
        }
      }
    };

    const options = {
      min: minBrowsers,
      max: maxBrowsers,
      idleTimeoutMillis: idleTimeout,
      testOnBorrow: true,
      acquireTimeoutMillis: 30000
    };

    this.pool = genericPool.createPool(factory, options);
    this.isInitialized = true;

    console.log('Browser pool initialized successfully');
  }

  /**
   * Get browser from pool
   */
  async getBrowser() {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const browser = await this.pool.acquire();
      console.log('Browser acquired from pool');
      return browser;
    } catch (error) {
      console.error('Failed to acquire browser from pool:', error);
      throw new Error('Browser pool exhausted or unavailable');
    }
  }

  /**
   * Return browser to pool
   */
  async returnBrowser(browser) {
    if (!browser) return;

    try {
      await this.pool.release(browser);
      console.log('Browser returned to pool');
    } catch (error) {
      console.error('Error returning browser to pool:', error);
      // Try to destroy the browser if we can't return it
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }

  /**
   * Get pool status
   */
  getStatus() {
    if (!this.pool) {
      return {
        initialized: false,
        size: 0,
        available: 0,
        pending: 0
      };
    }

    return {
      initialized: this.isInitialized,
      size: this.pool.size,
      available: this.pool.available,
      pending: this.pool.pending,
      spareResourceCapacity: this.pool.spareResourceCapacity,
      min: this.pool.min,
      max: this.pool.max
    };
  }

  /**
   * Cleanup - drain and clear the pool
   */
  async cleanup() {
    if (!this.pool) return;

    console.log('Starting browser pool cleanup...');
    
    try {
      await this.pool.drain();
      await this.pool.clear();
      this.isInitialized = false;
      console.log('Browser pool cleanup completed');
    } catch (error) {
      console.error('Error during pool cleanup:', error);
      throw error;
    }
  }
}

module.exports = new BrowserPoolService();
