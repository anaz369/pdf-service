'use strict';

const Handlebars    = require('handlebars');
const fs            = require('fs').promises;
const fsSync        = require('fs');
const path          = require('path');
const qrCodeService = require('./qrCodeService');

// ── Currency symbols ───────────────────────────────────────
const CURRENCY_SYMBOLS = {
  AED: 'د.إ',
  USD: '$',
  EUR: '€',
  GBP: '£',
  QAR: 'ر.ق',
  KWD: 'د.ك',
  BHD: 'د.ب',
  OMR: 'ر.ع',
  MYR: 'RM',
  INR: '₹',
  JPY: '¥',
  CNY: '¥',
  AUD: 'A$',
  CAD: 'C$',
};

// ── SVG helper — generic loader ────────────────────────────
function findSvgPath(filename) {
  const candidates = [
    path.join(__dirname, '..', 'assets', filename),
    path.join(__dirname, '..', 'public', 'assets', filename),
    path.join(process.cwd(), 'src', 'assets', filename),
    path.join(process.cwd(), 'assets', filename),
  ];
  return candidates.find(p => {
    try { return fsSync.existsSync(p); } catch { return false; }
  }) || null;
}

function loadCurrencySvg(filename, fallbackText) {
  const svgPath = findSvgPath(filename);
  const result  = { inline: '', dataUri: '' };

  if (!svgPath) {
    console.warn(`⚠ ${filename} not found. Falling back to text: ${fallbackText}`);
    result.inline = `<span style="font-family:Arial;">${fallbackText}</span>`;
    return result;
  }

  try {
    const raw = fsSync.readFileSync(svgPath, 'utf-8');

    result.inline = raw
      .replace(/<\?xml[^?]*\?>/gi, '')
      .trim()
      .replace(/<svg([^>]*)>/i, (match, attrs) => {
        const cleaned = attrs
          .replace(/\s*width\s*=\s*["'][^"']*["']/gi, '')
          .replace(/\s*height\s*=\s*["'][^"']*["']/gi, '');
        return `<svg${cleaned} style="height:0.75em;width:auto;vertical-align:middle;display:inline-block;margin-right:2px;">`;
      });

    result.dataUri = `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}`;
    console.log(`✓ ${filename} loaded from: ${svgPath}`);
  } catch (err) {
    console.warn(`⚠ Could not read ${filename}: ${err.message}. Falling back to text.`);
    result.inline = `<span style="font-family:Arial;">${fallbackText}</span>`;
  }

  return result;
}

// ── Load SAR + AED SVGs at startup ────────────────────────
let sarSvg = loadCurrencySvg('sar.svg', '﷼');
let aedSvg = loadCurrencySvg('aed.svg', 'د.إ');

// Map iso → svg object for easy lookup
const SVG_CURRENCY_MAP = {
  SAR: () => sarSvg,
  AED: () => aedSvg,
};

// ── Bootstrap CSS — loaded once at startup from node_modules ──
// No network call — reads from local disk (~1ms)
// Auto-injected into any HBS template that uses Bootstrap classes
// No CDN link needed in HBS templates
let bootstrapCss = '';
try {
  const bootstrapPath = path.join(
    __dirname, '..', '..', 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'
  );
  console.log('[Bootstrap] Looking at path:', bootstrapPath);
  console.log('[Bootstrap] File exists:', fsSync.existsSync(bootstrapPath));
  bootstrapCss = fsSync.readFileSync(bootstrapPath, 'utf-8');
  console.log('[Bootstrap] ✓ Loaded. Length:', bootstrapCss.length);
} catch (err) {
  console.warn('[Bootstrap] ✗ Failed:', err.message);
  // Fallback — try same directory as templateService.js
  try {
    const fallbackPath = path.join(__dirname, '..', '..', 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css');
    console.log('[Bootstrap] Trying fallback path:', fallbackPath);
    bootstrapCss = fsSync.readFileSync(fallbackPath, 'utf-8');
    console.log('[Bootstrap] ✓ Loaded from fallback. Length:', bootstrapCss.length);
  } catch (err2) {
    console.warn('[Bootstrap] ✗ Fallback also failed:', err2.message);
  }
}


class TemplateService {
  constructor() {
    this.compiledTemplates = new Map();
    this.registerHelpers();
    this.registerPartials();
  }

  // ── PARTIALS ──────────────────────────────────────────────
  registerPartials() {
    const partialsDir = path.join(__dirname, '..', 'templates', 'partials');
    try {
      if (fsSync.existsSync(partialsDir)) {
        fsSync.readdirSync(partialsDir)
          .filter(f => f.endsWith('.hbs'))
          .forEach(file => {
            const name   = file.replace('.hbs', '');
            const source = fsSync.readFileSync(path.join(partialsDir, file), 'utf-8');
            Handlebars.registerPartial(name, source);
            console.log(`Partial registered: ${name}`);
          });
      }
    } catch (err) {
      console.warn('Could not load partials directory:', err.message);
    }
  }

  // ── HELPERS ───────────────────────────────────────────────
  registerHelpers() {

    // ── Date / Currency formatting ─────────────────────────
    Handlebars.registerHelper('formatDate', function(dateStr) {
      if (!dateStr) return '----';
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric'
        }).replace(/ /g, '-');
      } catch { return dateStr; }
    });

    Handlebars.registerHelper('formatCurrency', function(value) {
      if (typeof value !== 'number') value = parseFloat(value) || 0;
      return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    });

    Handlebars.registerHelper('formatAmount', function(value, decimals) {
      const dp  = (typeof decimals === 'number') ? decimals : 2;
      const num = parseFloat(String(value || '0').replace(/,/g, '')) || 0;
      return num.toLocaleString('en-US', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      });
    });

    // ── String helpers ─────────────────────────────────────
    Handlebars.registerHelper('upper',    (str)  => str ? str.toUpperCase() : '');
    Handlebars.registerHelper('default',  (v, d) => v || d);
    Handlebars.registerHelper('json',     (ctx)  => JSON.stringify(ctx, null, 2));
    Handlebars.registerHelper('nl2br', (text) => text ? new Handlebars.SafeString(text.replace(/\n/g, '<br/>')) : '');

    // ── Comparison helpers ─────────────────────────────────
    Handlebars.registerHelper('and', (a, b) => a && b);
    Handlebars.registerHelper('eq',  (a, b) => a === b);
    Handlebars.registerHelper('neq', (a, b) => a !== b);
    Handlebars.registerHelper('gt',  (a, b) =>
      (parseFloat(String(a || 0).replace(/,/g, '')) || 0) >
      (parseFloat(String(b || 0).replace(/,/g, '')) || 0)
    );
    Handlebars.registerHelper('lt',  (a, b) =>
      (parseFloat(String(a || 0).replace(/,/g, '')) || 0) <
      (parseFloat(String(b || 0).replace(/,/g, '')) || 0)
    );

    // ── Math helpers — all strip commas before parsing ─────
    Handlebars.registerHelper('add',(a, b) =>
      (parseFloat(String(a || 0).replace(/,/g, '')) || 0) +
      (parseFloat(String(b || 0).replace(/,/g, '')) || 0)
    );
    Handlebars.registerHelper('subtract', (a, b) =>
      (parseFloat(String(a || 0).replace(/,/g, '')) || 0) -
      (parseFloat(String(b || 0).replace(/,/g, '')) || 0)
    );
    Handlebars.registerHelper('multiply', (a, b) =>
      (parseFloat(String(a || 0).replace(/,/g, '')) || 0) *
      (parseFloat(String(b || 0).replace(/,/g, '')) || 0)
    );
    Handlebars.registerHelper('divide',   (a, b) =>
      (parseFloat(String(a || 0).replace(/,/g, '')) || 0) /
      (parseFloat(String(b || 1).replace(/,/g, '')) || 1)
    );
   // SET VARIABLE
Handlebars.registerHelper('set', function (varName, varValue) {
  if (!this._vars) this._vars = {};
  this._vars[varName] = varValue;
});
    // ── Array / misc helpers ───────────────────────────────
    Handlebars.registerHelper('length',    (arr) => arr ? arr.length : 0);
    Handlebars.registerHelper('inc',       (val) => parseInt(val) + 1);
    Handlebars.registerHelper('addOne',    (val) => parseInt(val, 10) + 1);
    Handlebars.registerHelper('addOffset', (index, offset) =>
      parseInt(index, 10) + parseInt(offset, 10) + 1
    );
    Handlebars.registerHelper('notEmpty',  (val) =>
      val !== null && val !== undefined && val !== '' && val !== '0' && val !== 0
    );

    // ── Invoice-specific helpers ───────────────────────────
    Handlebars.registerHelper('ifFlag', function(settings, key, options) {
      const val = settings && settings[key];
      return (val == '1' || val === 1 || val === true)
        ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('ifZatca', function(settings, options) {
      return (settings && (settings.d51 == '154' || settings.d51 === 154))
        ? options.fn(this) : options.inverse(this);
    });

    Handlebars.registerHelper('joinAddress', function(addr, separator) {
      const sep = (typeof separator === 'string') ? separator : ', ';
      if (!addr || typeof addr !== 'object') return '';
      return [
        addr.address_line1, addr.address_line2, addr.address_line3,
        addr.address_line4, addr.address_line5, addr.address_code,
      ].filter(Boolean).join(sep);
    });

    // ── Currency symbol helpers ────────────────────────────
    Handlebars.registerHelper('currencySymbol', function(isocode) {
      const iso = (isocode || 'SAR').toUpperCase().trim();

      if (SVG_CURRENCY_MAP[iso]) {
        const svg = SVG_CURRENCY_MAP[iso]();
        if (svg.inline) return new Handlebars.SafeString(svg.inline);
      }

      return new Handlebars.SafeString(
        `<span>${CURRENCY_SYMBOLS[iso] || iso}</span>`
      );
    });

    Handlebars.registerHelper('currencyImg', function(isocode, size) {
      const iso    = (isocode || 'SAR').toUpperCase().trim();
      const height = (typeof size === 'string') ? size : '8px';

      if (SVG_CURRENCY_MAP[iso]) {
        const svg = SVG_CURRENCY_MAP[iso]();
        if (svg.dataUri) {
          return new Handlebars.SafeString(
            `<img src="${svg.dataUri}" ` +
            `style="height:${height};width:auto;vertical-align:middle;margin-right:2px;" alt="${iso}">`
          );
        }
      }

      return new Handlebars.SafeString(
        `<span>${CURRENCY_SYMBOLS[iso] || iso}</span>`
      );
    });

    Handlebars.registerHelper('qrDataUri', function(qrCodeBase64) {
      if (qrCodeBase64 && String(qrCodeBase64).length > 20) {
        return new Handlebars.SafeString(
          `<img src="data:image/png;base64,${qrCodeBase64}" ` +
          `width="130" height="130" style="display:block;" alt="QR Code">`
        );
      }
      return new Handlebars.SafeString(
        `<span style="font-size:9px;color:#999;">QR unavailable</span>`
      );
    });

  }

  // ── DATA PREPARATION ──────────────────────────────────────
  prepareTemplateData(data) {
    const basic = (data.basicdetails && data.basicdetails[0]) || {};
    const iso   = (basic.isocode || 'SAR').toUpperCase().trim();

    data.isocode = iso;
    data.isSAR   = iso === 'SAR';
    data.isAED   = iso === 'AED';

    data.ccrate = parseFloat(
      String(data.ccrate || basic.ccrate || 1).replace(/,/g, '')
    ) || 1;

    data.bcdp = parseInt(data.bcdp || basic.bcdp || 2);

    return data;
  }

  // ── RENDER ────────────────────────────────────────────────
  async renderToString(templateName, data, docTypeFolder = 'invoice') {
    try {
      const templateData = this.prepareTemplateData(data);

      const cacheKey = `${docTypeFolder}/${templateName}`;
      if (!this.compiledTemplates.has(cacheKey)) {
        const templatePath = path.join(
          __dirname, '..', 'templates', docTypeFolder, `${templateName}.hbs`
        );
        console.log(`Loading template: ${templatePath}`);
        const source = await fs.readFile(templatePath, 'utf-8');
        this.compiledTemplates.set(cacheKey, Handlebars.compile(source));
      }

      let html = this.compiledTemplates.get(cacheKey)(templateData);

      // ── Bootstrap CSS injection ──────────────────────────
      // If template has Bootstrap CDN link → replace with inline styles
      // No network call needed — served from local node_modules
      console.log('[Bootstrap] bootstrapCss loaded:', bootstrapCss.length > 0);
      console.log('[Bootstrap] html has cdn link:', html.includes('cdn.jsdelivr.net'));
      if (bootstrapCss) {
        const bootstrapStyle = `<style>${bootstrapCss}</style>`;
        if (html.includes('cdn.jsdelivr.net')) {
          html = html.replace(
            /<link[^<]*bootstrap[^<]*>/gi,
            bootstrapStyle
          );
          console.log('[Bootstrap] ✓ Injected. html length now:', html.length);
        }
      }

      console.log(`Template rendered: ${cacheKey} (${html.length} chars)`);
      return html;

    } catch (error) {
      console.error(`Error rendering template ${templateName}:`, error);
      throw new Error(`Template rendering failed: ${error.message}`);
      
    }
  }

  // ── CACHE ─────────────────────────────────────────────────
  clearCache() {
    this.compiledTemplates.clear();
    sarSvg = loadCurrencySvg('sar.svg', '﷼');
    aedSvg = loadCurrencySvg('aed.svg', 'د.إ');
    console.log('Template cache cleared');
  }

  async precompileTemplates() {
    const templatesDir = path.join(__dirname, '..', 'templates');
    try {
      const files = await fs.readdir(templatesDir);
      for (const file of files.filter(f => f.endsWith('.hbs'))) {
        const name = file.replace('.hbs', '');
        const src  = await fs.readFile(path.join(templatesDir, file), 'utf-8');
        this.compiledTemplates.set(name, Handlebars.compile(src));
        console.log(`Precompiled: ${name}`);
      }
      console.log('All templates precompiled successfully');
    } catch (error) {
      console.error('Error precompiling templates:', error);
      throw error;
    }
  }

  // ── RAHATH PAGINATION ─────────────────────────────────────
  prepareRahathData(data, maxRowsPerPage = 18) {
    const items = data.itemdetails || [];
    const pages = [];

    for (let i = 0; i < items.length; i += maxRowsPerPage) {
      pages.push({ items: items.slice(i, i + maxRowsPerPage), startIndex: i });
    }

    if (pages.length === 0) pages.push({ items: [], startIndex: 0 });

    data.pageItems  = pages[0].items;
    data.startIndex = pages[0].startIndex;
    data.isLastPage = pages.length === 1;

    data.extraPages = pages.slice(1).map((page, idx) => ({
      pageItems:  page.items,
      startIndex: page.startIndex,
      isLastPage: idx === pages.length - 2
    }));

    return data;
  }

}

module.exports = new TemplateService();