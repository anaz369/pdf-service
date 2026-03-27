# cPanel Deployment Guide

## Step-by-Step Deployment to cPanel

### Prerequisites
- cPanel account with Node.js support
- SSH access (recommended but not required)
- FTP/File Manager access

---

## Method 1: Using cPanel File Manager (Easiest)

### Step 1: Prepare Files
1. Download/zip your entire `pdf-service` folder
2. Make sure `.env` file is configured

### Step 2: Upload via cPanel
1. Login to cPanel
2. Go to **File Manager**
3. Navigate to your home directory (e.g., `/home/username/`)
4. Click **Upload** and upload the zip file
5. Extract the zip file
6. You should now have `/home/username/pdf-service/`

### Step 3: Install Dependencies
**Option A - Using cPanel Terminal:**
1. In cPanel, find **Terminal** (may be called "Terminal" or "SSH Access")
2. Run:
```bash
cd ~/pdf-service
npm install --production
```

**Option B - SSH:**
```bash
ssh username@your-server.com
cd ~/pdf-service
npm install --production
```

### Step 4: Setup Node.js App in cPanel
1. Go to **Setup Node.js App** in cPanel
2. Click **Create Application**
3. Fill in:
   - **Node.js version**: 18.x or higher (choose latest available)
   - **Application mode**: Production
   - **Application root**: `pdf-service`
   - **Application URL**: Choose a domain/subdomain (e.g., `pdf.yourdomain.com` or just use main domain)
   - **Application startup file**: `src/server.js`
   - **Passenger log file**: Leave enabled for debugging

4. Click **Create**

### Step 5: Configure Environment Variables
In the Node.js App settings, add these environment variables:

```
PORT=3000
NODE_ENV=production
PUPPETEER_HEADLESS=true
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage
BROWSER_POOL_MIN=2
BROWSER_POOL_MAX=3
```

**Important for cPanel:** If Puppeteer fails to find Chrome, add:
```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```
or
```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
```

### Step 6: Start the Application
1. In the Node.js App interface, click **Start App** or **Restart**
2. Wait for it to initialize
3. Check the **Status** - it should show "Running"

### Step 7: Test the Service
Visit in your browser:
```
https://your-domain.com/api/pdf/test
```

You should see JSON response with status information.

---

## Method 2: Using Git (Recommended for Updates)

### Initial Setup
1. In cPanel, go to **Terminal**
2. Clone your repository:
```bash
cd ~
git clone https://github.com/your-username/pdf-service.git
cd pdf-service
npm install --production
```

3. Follow Steps 4-7 from Method 1

### For Updates
```bash
cd ~/pdf-service
git pull
npm install --production
# Then restart the app in cPanel Node.js App interface
```

---

## Troubleshooting

### Problem 1: "Failed to launch browser"

**Solution A - Install Chromium dependencies:**
```bash
# Contact your hosting provider to install these:
# - chromium-browser
# - chromium-chromedriver
# - Or google-chrome-stable
```

**Solution B - Use system Chrome:**
Add to environment variables in cPanel:
```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

**Solution C - Skip Chromium download:**
Before running `npm install`, add to `.env`:
```
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Problem 2: "EACCES: permission denied"

Fix permissions:
```bash
cd ~/pdf-service
chmod -R 755 .
chmod +x src/server.js
```

### Problem 3: "Application won't start"

**Check logs:**
1. In cPanel Node.js App, click on your app
2. Scroll down to **Passenger log file**
3. Read the error messages

**Common fixes:**
```bash
# Missing dependencies
npm install

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install --production

# Check if port is available
# Make sure PORT in .env matches cPanel's port
```

### Problem 4: "Out of memory"

PDF generation is memory-intensive. Solutions:

1. **Reduce browser pool:**
```env
BROWSER_POOL_MIN=1
BROWSER_POOL_MAX=2
```

2. **Contact hosting provider** to increase memory limit (recommended: 2GB+ RAM)

3. **Use external PDF service** on a VPS with more resources

### Problem 5: "Module not found"

```bash
cd ~/pdf-service
npm install
# Restart app in cPanel
```

---

## Performance Tips for cPanel

### 1. Optimize Browser Pool
For shared hosting with limited resources:
```env
BROWSER_POOL_MIN=1
BROWSER_POOL_MAX=2
BROWSER_POOL_IDLE_TIMEOUT=10000
```

### 2. Enable Caching
Already enabled by default, but verify in `.env`:
```env
CACHE_TTL_SECONDS=7200  # Cache for 2 hours
```

### 3. Reduce Image Quality (if needed)
```env
IMAGE_QUALITY=85  # Lower quality = smaller files = faster
```

### 4. Monitor Resource Usage
```bash
# Check memory usage
free -h

# Check disk usage
df -h

# Check running Node processes
ps aux | grep node
```

---

## Security for Production

### 1. Restrict CORS
In `.env`:
```env
ALLOWED_ORIGINS=https://your-main-site.com
```

### 2. Add Basic Authentication (Optional)
Edit `src/app.js` and add before routes:
```javascript
app.use('/api', (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== 'Bearer YOUR_SECRET_KEY') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

Then in your PHP code:
```php
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer YOUR_SECRET_KEY'
]);
```

---

## Monitoring & Maintenance

### Check Application Status
1. Login to cPanel
2. Go to **Setup Node.js App**
3. Your app status should be "Running"
4. Check **Memory Usage** and **CPU Usage**

### View Logs
In cPanel Node.js App settings:
- Click on your application
- Scroll to **Passenger log file**
- Click to view recent logs

### Restart Application
When to restart:
- After code changes
- After .env changes
- If application becomes unresponsive

How:
1. cPanel → Setup Node.js App
2. Click **Restart** or **Stop App** then **Start App**

### Cleanup (Monthly)
```bash
cd ~/pdf-service
# Clear npm cache
npm cache clean --force

# Restart the app via cPanel
```

---

## Integration with Your PHP Application

### Sample CodeIgniter Integration

**In your controller:**
```php
<?php
class Pdf_controller extends CI_Controller {
    
    private $pdf_service_url = 'http://localhost:3000/api/pdf/razor-view-pdf';
    // Or use domain: 'https://pdf.your-domain.com/api/pdf/razor-view-pdf';
    
    public function generate_invoice($invoice_id) {
        // Prepare data
        $data = [
            'ReportType' => 7,
            'MyInvoisDocument' => $this->prepare_invoice_data($invoice_id)
        ];
        
        // Call PDF service
        $pdf = $this->call_pdf_service($data);
        
        if ($pdf) {
            // Send to browser
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="invoice.pdf"');
            echo $pdf;
        } else {
            show_error('PDF generation failed');
        }
    }
    
    private function call_pdf_service($data) {
        $ch = curl_init($this->pdf_service_url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);
        
        $response = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        return ($http_code === 200) ? $response : false;
    }
    
    private function prepare_invoice_data($invoice_id) {
        // Load your models and prepare data structure
        // matching the Node.js service expectations
        return [
            'Document' => $this->invoice_model->get($invoice_id),
            'Supplier' => $this->company_model->get_supplier(),
            'Buyer' => $this->customer_model->get_buyer(),
            'Items' => $this->invoice_model->get_items($invoice_id),
            // ... more data
        ];
    }
}
```

---

## Backup & Recovery

### Backup
```bash
cd ~
tar -czf pdf-service-backup-$(date +%Y%m%d).tar.gz pdf-service/
```

### Restore
```bash
cd ~
tar -xzf pdf-service-backup-YYYYMMDD.tar.gz
cd pdf-service
npm install --production
# Restart via cPanel
```

---

## Support Checklist

Before contacting support, check:

- [ ] Node.js version is 18+
- [ ] All dependencies installed (`npm install` completed successfully)
- [ ] Environment variables are set correctly
- [ ] Application shows "Running" in cPanel
- [ ] Passenger log shows no errors
- [ ] Test endpoint (`/api/pdf/test`) returns JSON
- [ ] Port is not blocked by firewall
- [ ] Sufficient memory available (2GB+ recommended)

---

## Next Steps

1. ✅ Deploy to cPanel
2. ✅ Test with `/api/pdf/test`
3. ✅ Generate a test PDF
4. ✅ Integrate with your PHP application
5. ✅ Add other templates (timesheet, RFQ, etc.)
6. ✅ Set up monitoring
7. ✅ Configure backups

---

**Your PDF service is now running on cPanel!** 🎉
