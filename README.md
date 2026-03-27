# PDF Generation Service - Node.js + Puppeteer

Complete Node.js PDF generation service migrated from .NET PuppeteerSharp. Optimized for cPanel deployment.

## 📋 Features

- ✅ Convert .NET PuppeteerSharp to Node.js Puppeteer
- ✅ MyInvois PDF generation (Invoices, Credit Notes, Debit Notes, Refund Notes)
- ✅ QR Code generation
- ✅ Watermark support
- ✅ Header/Footer support
- ✅ Image processing with Sharp (replaces ImageMagick)
- ✅ Browser pooling for performance
- ✅ In-memory caching
- ✅ Handlebars templating (replaces Razor views)
- ✅ Ready for cPanel deployment

## 🚀 Quick Start

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env .env.local
# Edit .env.local if needed

# 3. Start server
npm start

# Development mode with auto-restart
npm run dev
```

Server will run on `http://localhost:3000`

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- npm or yarn
- For cPanel: Node.js app support enabled

### Step 1: Upload Files

Upload the entire `pdf-service` folder to your cPanel server:

```
/home/your-username/pdf-service/
```

### Step 2: Install Dependencies

SSH into your cPanel server or use Terminal in cPanel:

```bash
cd /home/your-username/pdf-service
npm install --production
```

This will install:
- express - Web framework
- puppeteer - PDF generation
- sharp - Image processing
- qrcode - QR code generation
- handlebars - Templates
- node-cache - Caching
- generic-pool - Browser pooling

### Step 3: Configure Environment

Edit `.env` file:

```env
PORT=3000
NODE_ENV=production

# Browser Pool
BROWSER_POOL_MIN=2
BROWSER_POOL_MAX=5

# For cPanel, you might need to specify Chrome path
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Step 4: Setup in cPanel

1. **Login to cPanel**
2. **Go to "Setup Node.js App"**
3. **Create Application**:
   - **Node.js version**: 18.x or higher
   - **Application mode**: Production
   - **Application root**: `/home/your-username/pdf-service`
   - **Application URL**: `your-domain.com` or subdomain
   - **Application startup file**: `src/server.js`
   - **Passenger log file**: Enable for debugging

4. **Set Environment Variables** in cPanel:
   ```
   PORT=3000
   NODE_ENV=production
   PUPPETEER_HEADLESS=true
   ```

5. **Start Application**

## 🔧 cPanel Deployment Notes

### Important cPanel Settings

1. **Memory Limits**: PDF generation is memory-intensive. Ensure your hosting plan has at least **2GB RAM**.

2. **Chrome/Chromium**: 
   - cPanel servers usually have Chromium installed
   - If you get errors, specify the path in `.env`:
   ```env
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   ```

3. **Timeouts**: 
   - Increase PHP/Node execution time limits if PDFs take long to generate
   - Default is 45 seconds (configured in code)

### Troubleshooting cPanel

**Problem: "Failed to launch browser"**
```bash
# Solution 1: Install dependencies
npm install puppeteer --save

# Solution 2: Use system Chrome
# Add to .env:
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage
```

**Problem: "EACCES permission denied"**
```bash
# Fix file permissions
chmod -R 755 /home/your-username/pdf-service
chmod +x /home/your-username/pdf-service/src/server.js
```

**Problem: Application won't start**
```bash
# Check logs in cPanel
# Or SSH and run manually:
cd /home/your-username/pdf-service
node src/server.js
```

## 📡 API Endpoints

### Test Endpoint
```bash
GET /api/pdf/test
```

Returns server status and configuration.

### Generate PDF
```bash
POST /api/pdf/razor-view-pdf
Content-Type: application/json

{
  "ReportType": 7,
  "MyInvoisDocument": {
    "Document": { ... },
    "Supplier": { ... },
    "Buyer": { ... },
    "Items": [ ... ]
  },
  "UseBGWatermark": true,
  "WatermarkUrl": "https://example.com/watermark.png",
  "WatermarkOpacity": 0.7
}
```

Returns PDF file as download.

### Cleanup Browser Pool
```bash
POST /api/pdf/cleanup-browser-pool
```

Manually cleanup browser instances.

## 🔌 Integration with CodeIgniter (PHP)

### Example PHP Code

```php
<?php
// In your CodeIgniter controller

public function generate_myinvois_pdf() {
    $pdfServiceUrl = 'http://localhost:3000/api/pdf/razor-view-pdf';
    
    $data = [
        'ReportType' => 7,
        'MyInvoisDocument' => [
            'Document' => $this->invoice_model->get_document($invoice_id),
            'Supplier' => $this->company_model->get_supplier_details(),
            'Buyer' => $this->customer_model->get_buyer_details($customer_id),
            'Items' => $this->invoice_model->get_items($invoice_id),
            // ... more data
        ],
        'UseBGWatermark' => true,
        'WatermarkUrl' => base_url('assets/images/watermark.png'),
        'WatermarkOpacity' => 0.7
    ];
    
    // Make request to Node.js service
    $ch = curl_init($pdfServiceUrl);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    
    $pdfContent = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode === 200) {
        // Success - send PDF to browser
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="invoice.pdf"');
        echo $pdfContent;
    } else {
        // Error handling
        echo "PDF Generation Failed: " . $pdfContent;
    }
}
```

## 🎨 Adding More Templates

To add support for other report types (timesheet, RFQ, etc.):

1. **Create Handlebars template** in `src/templates/`:
   ```bash
   src/templates/timesheet.hbs
   ```

2. **Template structure**:
   ```handlebars
   <!DOCTYPE html>
   <html>
   <head>
       <title>{{Timesheet.timesheet_number}}</title>
       <style>
           /* Your styles */
       </style>
   </head>
   <body>
       <h1>{{Timesheet.project_name}}</h1>
       {{#each TimesheetDetails}}
           <div>{{work_date}}: {{normal_hours}} hours</div>
       {{/each}}
   </body>
   </html>
   ```

3. **Add to controller** - already configured in `pdfController.js`:
   ```javascript
   case 1:
       viewName = 'timesheet'; // Will load timesheet.hbs
       break;
   ```

## 📊 Performance Optimization

### Browser Pool Settings

Adjust in `.env`:
```env
BROWSER_POOL_MIN=2    # Minimum browsers always ready
BROWSER_POOL_MAX=5    # Maximum concurrent browsers
BROWSER_POOL_IDLE_TIMEOUT=30000  # Kill idle browsers after 30s
```

### Cache Settings

```env
CACHE_TTL_SECONDS=3600    # Cache images for 1 hour
CACHE_MAX_SIZE_MB=500     # Maximum cache size
```

### Production Tips

1. **Use PM2** (if available on your hosting):
   ```bash
   npm install -g pm2
   pm2 start src/server.js --name pdf-service
   pm2 save
   ```

2. **Monitor logs**:
   ```bash
   pm2 logs pdf-service
   ```

3. **Auto-restart on crash**:
   - PM2 handles this automatically
   - Or configure cPanel's "Restart on failure"

## 🛡️ Security

- Enable CORS only for your domain
- Add authentication if needed
- Use HTTPS in production
- Limit request size (already configured: 10MB max)

Edit `.env`:
```env
ALLOWED_ORIGINS=https://your-domain.com,https://admin.your-domain.com
```

## 📝 Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |
| `PUPPETEER_HEADLESS` | true | Run Chrome headless |
| `PUPPETEER_EXECUTABLE_PATH` | - | Path to Chrome/Chromium |
| `BROWSER_POOL_MIN` | 2 | Min browser instances |
| `BROWSER_POOL_MAX` | 5 | Max browser instances |
| `PDF_TIMEOUT_MS` | 45000 | PDF generation timeout |
| `PDF_MAX_RETRIES` | 2 | Retry attempts on failure |
| `IMAGE_QUALITY` | 95 | JPEG quality (0-100) |
| `CACHE_TTL_SECONDS` | 3600 | Cache expiration |

## 🐛 Debugging

Enable detailed logging:
```env
NODE_ENV=development
```

Then check console output for detailed logs.

## 📄 License

MIT

## 🤝 Support

For issues or questions, check the logs in:
- cPanel: Passenger log file
- SSH: `node src/server.js` output
- PM2: `pm2 logs pdf-service`

---

**Migration Complete!** ✨

Your .NET PuppeteerSharp service is now running on Node.js with Puppeteer, optimized for cPanel deployment.
