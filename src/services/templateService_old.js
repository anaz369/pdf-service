'use strict';

const Handlebars    = require('handlebars');
const fs            = require('fs').promises;
const fsSync        = require('fs');
const path          = require('path');
const qrCodeService = require('./qrCodeService'); // ← your existing service

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
};

// ── SAR SVG — searches common locations at startup ──────
// Place sar.svg in ONE of these paths in your project:
//   ✅ src/assets/sar.svg        (recommended)
//   ✅ assets/sar.svg
//   ✅ public/assets/sar.svg
const SAR_SVG_CANDIDATES = [
  require('path').join(__dirname, '..', 'assets', 'sar.svg'),
  require('path').join(__dirname, '..', 'public', 'assets', 'sar.svg'),
  require('path').join(process.cwd(), 'src', 'assets', 'sar.svg'),
  require('path').join(process.cwd(), 'assets', 'sar.svg'),
];

const SAR_SVG_PATH = SAR_SVG_CANDIDATES.find(p => {
  try { return require('fs').existsSync(p); } catch { return false; }
}) || null;

let sarSvgInline  = '';
let sarSvgDataUri = '';

function loadSarSvg() {
  if (!SAR_SVG_PATH) {
    console.warn('⚠ sar.svg not found in any candidate path. Place it at src/assets/sar.svg. Falling back to text.');
    sarSvgInline  = '<span style="font-family:Arial;">ر.س</span>';
    sarSvgDataUri = '';
    return;
  }

  try {
    const raw = fsSync.readFileSync(SAR_SVG_PATH, 'utf-8');

    // Inline: strip XML declaration, inject sizing style
    sarSvgInline = raw
      .replace(/<\?xml[^?]*\?>/gi, '')   // remove <?xml ...?>
      .trim()
      .replace(/<svg([^>]*)>/i, (match, attrs) => {
        // Strip any hardcoded width/height attributes the SVG file may have
        // then inject our own size via style so we fully control the size
        const cleaned = attrs
          .replace(/\s*width\s*=\s*["'][^"']*["']/gi, '')
          .replace(/\s*height\s*=\s*["'][^"']*["']/gi, '');
        return `<svg${cleaned} style="height:0.75em;width:auto;vertical-align:middle;display:inline-block;margin-right:2px;">`;
      });

    // Data URI: for <img src="..."> usage
    sarSvgDataUri = `data:image/svg+xml;base64,${Buffer.from(raw).toString('base64')}`;

    console.log(`✓ SAR SVG loaded from: ${SAR_SVG_PATH}`);
  } catch (err) {
    console.warn(`⚠ Could not read sar.svg: ${err.message}. Falling back to text.`);
    sarSvgInline  = '<span style="font-family:Arial;">ر.س</span>';
    sarSvgDataUri = '';
  }
}

loadSarSvg();


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

    // ── Your existing helpers (unchanged) ──────────────────

    Handlebars.registerHelper('formatDate', function(dateStr) {
      if (!dateStr) return '----';
      try {
        return new Date(dateStr).toLocaleString('en-GB', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: true
        });
      } catch { return dateStr; }
    });

    Handlebars.registerHelper('formatCurrency', function(value) {
      if (typeof value !== 'number') value = parseFloat(value) || 0;
      return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    });

    Handlebars.registerHelper('upper',    (str)   => str ? str.toUpperCase() : '');
    Handlebars.registerHelper('gt',       (a, b)  => a > b);
    Handlebars.registerHelper('eq',       (a, b)  => a === b);
    Handlebars.registerHelper('add',      (a, b)  => (parseFloat(a) || 0) + (parseFloat(b) || 0));
    Handlebars.registerHelper('subtract', (a, b)  => (parseFloat(a) || 0) - (parseFloat(b) || 0));
    Handlebars.registerHelper('multiply', (a, b)  => (parseFloat(a) || 0) * (parseFloat(b) || 0));
    Handlebars.registerHelper('length',   (arr)   => arr ? arr.length : 0);
    Handlebars.registerHelper('inc',      (val)   => parseInt(val) + 1);
    Handlebars.registerHelper('default',  (v, d)  => v || d);
    Handlebars.registerHelper('json',     (ctx)   => JSON.stringify(ctx, null, 2));
    Handlebars.registerHelper('nl2br',    (text)  => text ? text.replace(/\n/g, ', ') : '');

    // ── Invoice helpers ────────────────────────────────────

    Handlebars.registerHelper('addOne',   (val)  => parseInt(val, 10) + 1);
    // addOffset: used for serial numbers across pages
    // usage: {{addOffset @index ../startIndex}} → page2 row0 + offset18 = 19
    Handlebars.registerHelper('addOffset', (index, offset) => parseInt(index, 10) + parseInt(offset, 10) + 1);
    Handlebars.registerHelper('neq',      (a, b) => a !== b);
    Handlebars.registerHelper('notEmpty', (val)  =>
      val !== null && val !== undefined && val !== '' && val !== '0' && val !== 0
    );

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

    Handlebars.registerHelper('formatAmount', function(value, decimals) {
      const dp  = (typeof decimals === 'number') ? decimals : 2;
      const num = parseFloat(String(value || '0').replace(/,/g, '')) || 0;
      return num.toLocaleString('en-US', {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      });
    });

    /**
     * {{{currencySymbol isocode}}}   ← TRIPLE braces always
     *
     * SAR  → inline SVG read from assets/sar.svg
     * Others → plain text symbol
     */
    Handlebars.registerHelper('currencySymbol', function(isocode) {
      const iso = (isocode || 'SAR').toUpperCase().trim();
      if (iso === 'SAR') {
        return new Handlebars.SafeString(sarSvgInline);
      }
      return new Handlebars.SafeString(
        `<span>${CURRENCY_SYMBOLS[iso] || iso}</span>`
      );
    });

    /**
     * {{{currencyImg isocode "16px"}}}   ← TRIPLE braces
     * Alternative: <img> tag with base64 data URI.
     */
    Handlebars.registerHelper('currencyImg', function(isocode, size) {
      const iso    = (isocode || 'SAR').toUpperCase().trim();
      const height = (typeof size === 'string') ? size : '14px';
      if (iso === 'SAR' && sarSvgDataUri) {
        return new Handlebars.SafeString(
          `<img src="${sarSvgDataUri}" ` +
          `style="height:${height};width:auto;vertical-align:middle;margin-right:2px;" alt="SAR">`
        );
      }
      return new Handlebars.SafeString(
        `<span>${CURRENCY_SYMBOLS[iso] || iso}</span>`
      );
    });

    /**
     * {{{qrDataUri qrCodeBase64}}}   ← TRIPLE braces
     *
     * QR code is now pre-generated in pdfController BEFORE rendering
     * (using qrCodeService) and stored in data.qrCodeBase64.
     * This helper just wraps it in an <img> tag.
     *
     * If qrCodeBase64 is empty, falls back to a plain text notice.
     */
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

  /**
   * Inject computed fields before rendering.
   *
   * QR code is NOT generated here — it is generated in pdfController
   * via qrCodeService and stored in data.qrCodeBase64 before this runs.
   */
  prepareTemplateData(data) {
    const basic = (data.basicdetails && data.basicdetails[0]) || {};
    const iso   = (basic.isocode || 'SAR').toUpperCase().trim();

    data.isocode       = iso;
    data.isSAR         = iso === 'SAR';
    data.decimalPlaces = parseInt(((data.datasettings || {}).d581 || '2'), 10);

    return data;
  }

  // ── RENDER ────────────────────────────────────────────────

  async renderToString(templateName, data) {
    try {
      const templateData = this.prepareTemplateData(data);

      if (!this.compiledTemplates.has(templateName)) {
        const templatePath = path.join(
          __dirname, '..', 'templates', `${templateName}.hbs`
        );
        console.log(`Loading template: ${templatePath}`);
        const source = await fs.readFile(templatePath, 'utf-8');
        this.compiledTemplates.set(templateName, Handlebars.compile(source));
      }

      const html = this.compiledTemplates.get(templateName)(templateData);
      console.log(`Template rendered: ${templateName} (${html.length} chars)`);
      return html;

    } catch (error) {
      console.error(`Error rendering template ${templateName}:`, error);
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  clearCache() {
    this.compiledTemplates.clear();
    loadSarSvg(); // reload SVG too
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
  /**
   * prepareRahathData()
   * ─────────────────────────────────────────────────────────
   * Splits itemdetails into pages for the pre-printed form.
   *
   * RAHATH form content area: 148mm tall, each row 8mm = 18 rows max per page.
   * Injects into data:
   *   data.pageItems   → items for page 1
   *   data.extraPages  → [{pageItems, isLastPage}, ...] for page 2+
   *   data.isLastPage  → true if all items fit on page 1
   *
   * Also converts LetterheadImageUrl to base64 if it is a URL,
   * so the background-image works offline in Puppeteer.
   */
  prepareRahathData(data, maxRowsPerPage = 18) {
    const items = data.itemdetails || [];
    const pages = [];

    // Chunk items, track startIndex for serial number continuity
    for (let i = 0; i < items.length; i += maxRowsPerPage) {
      pages.push({ items: items.slice(i, i + maxRowsPerPage), startIndex: i });
    }

    if (pages.length === 0) pages.push({ items: [], startIndex: 0 });

    // Page 1 — startIndex always 0
    data.pageItems  = pages[0].items;
    data.startIndex = pages[0].startIndex;
    data.isLastPage = pages.length === 1;

    // Extra pages — startIndex: 18, 36, 54...
    data.extraPages = pages.slice(1).map((page, idx) => ({
      pageItems:  page.items,
      startIndex: page.startIndex,
      isLastPage: idx === pages.length - 2
    }));

    return data;
  }

}

module.exports = new TemplateService();