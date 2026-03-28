const axios   = require('axios');
const { PDFDocument } = require('pdf-lib');
const templateService = require('../services/templateService');
const { getDocTypeInfo } = require('../config/docTypes');
const qrCodeService = require('../services/qrCodeService');
const pdfService = require('../services/pdfService');

// AWS Lambda API endpoint
// const LAMBDA_PDF_API = 'https://49ov366dtf.execute-api.us-east-1.amazonaws.com/default/puppeteer-pdf-generator';
const LAMBDA_PDF_API = 'https://hcpuerxkuc.execute-api.ap-south-1.amazonaws.com/default/puppeteer-pdf-generator';

class PdfController {
  /**
   * Test endpoint
   */
  async test(req, res) {
    try {
      res.json({
        message: 'API is working fine test',
        url: req.path,
        environment: process.platform,
        runtime: process.version,
        nodeEnv: process.env.NODE_ENV,
        lambdaEndpoint: LAMBDA_PDF_API,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Generate PDF using AWS Lambda
   */
  async generatePdfWithRazorView(req, res) {
    const startTime = Date.now();

    try {
      let pdfRequest = req.body;

      if (!pdfRequest) {
        return res.status(400).json({ error: 'PDF request data is required' });
      }

      // ── Parse numeric fields — PHP sends strings ──────────
      // switch/comparison uses strict equality so "201" !== 201
      pdfRequest.ReportType  = parseInt(pdfRequest.ReportType,  10);
      pdfRequest.template_no = parseInt(pdfRequest.template_no, 10);
      pdfRequest.doc_type    = parseInt(pdfRequest.doc_type,    10) || 1;

      const docTypeInfo   = getDocTypeInfo(pdfRequest.doc_type);
      const docTypeFolder = docTypeInfo.folder;

      console.log('\n=== PDF Generation Started (Lambda Mode) ===');
      console.log(`Template No: ${pdfRequest.template_no}, Doc Type: ${pdfRequest.doc_type} (${docTypeInfo.label})`);

      // ============================================
      // PHASE 1: PARALLEL PREPROCESSING
      // ============================================
      const preprocessingTasks = [];

      // ── Task 1: QR Code ──────────────────────────────────
      // Skip QR for thermal and pre-print templates
      // pdfRequest.qrcode is a ZATCA TLV base64 string → converted to PNG QR image
      const needsQr = ![201, 202, 211].includes(pdfRequest.template_no);

      if (needsQr && pdfRequest.qrcode && String(pdfRequest.qrcode).length > 0) {
        console.log('↻ Generating QR image from ZATCA TLV string...');
        preprocessingTasks.push(
          qrCodeService.generateQrCodeBase64(pdfRequest.qrcode)
            .then(base64 => {
              pdfRequest.qrCodeBase64 = base64;
              console.log(`✓ QR image generated successfully (${base64.length} chars)`);
            })
            .catch(err => {
              console.error('✗ QR code generation failed:', err.message);
              pdfRequest.qrCodeBase64 = '';
            })
        );
      } else {
        console.log('✓ QR skipped (not required for this template)');
      }

      // ── Task 2: Watermark CSS ────────────────────────────
      if (pdfRequest.UseBGWatermark && pdfRequest.WatermarkUrl) {
        preprocessingTasks.push(
          pdfService.generateWatermarkCss(
            pdfRequest.WatermarkUrl,
            pdfRequest.WatermarkOpacity || 0.7
          )
            .then(watermarkCss => {
              pdfRequest.WatermarkCss = watermarkCss;
              console.log(`✓ Watermark CSS generated (opacity: ${pdfRequest.WatermarkOpacity || 0.7})`);
            })
            .catch(err => console.error('✗ Watermark generation failed:', err))
        );
      }


// ── Task 4: Seal → base64 ───────────────────────────────────  ← ADD HERE
if (pdfRequest.Seal && String(pdfRequest.Seal).startsWith('http')) {
  preprocessingTasks.push(
    pdfService.getHighQualityImageBytes(pdfRequest.Seal)
      .then(imgBuffer => {
        if (imgBuffer) {
          pdfRequest.Seal = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
          console.log('✓ Seal converted to base64');
        }
      })
      .catch(err => {
        console.error('✗ Seal failed:', err.message);
        pdfRequest.Seal = '';
      })
  );
}

// ── Task 5: Signature → base64 ─────────────────────────────
if (pdfRequest.Signature && String(pdfRequest.Signature).startsWith('http')) {
  preprocessingTasks.push(
    pdfService.getHighQualityImageBytes(pdfRequest.Signature)
      .then(imgBuffer => {
        if (imgBuffer) {
          pdfRequest.Signature = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
          console.log('✓ Signature converted to base64');
        }
      })
      .catch(err => {
        console.error('✗ Signature failed:', err.message);
        pdfRequest.Signature = '';
      })
  );
}

// ── Task 6: Company logo → base64 ──────────────────────────
if (pdfRequest.Companylogo && String(pdfRequest.Companylogo).startsWith('http')) {
  preprocessingTasks.push(
    pdfService.getHighQualityImageBytes(pdfRequest.Companylogo)
      .then(imgBuffer => {
        if (imgBuffer) {
          pdfRequest.Companylogo = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;
          console.log('✓ Logo converted to base64');
        }
      })
      .catch(err => {
        console.error('✗ Logo failed:', err.message);
        pdfRequest.Companylogo = '';
      })
  );
}


      // ── Task 3: MyInvois QR ──────────────────────────────
      if (pdfRequest.MyInvoisDocument?.myinvois) {
        const myinvois = pdfRequest.MyInvoisDocument.myinvois;
        if (!myinvois.qr_code && myinvois.uuid && myinvois.long_id) {
          preprocessingTasks.push(
            qrCodeService.generateMyInvoisQr(myinvois.uuid, myinvois.long_id)
              .then(qrDataUri => {
                myinvois.qr_code = qrDataUri;
                console.log('✓ MyInvois QR generated successfully');
              })
              .catch(err => console.error('✗ MyInvois QR generation failed:', err))
          );
        }
      }

      await Promise.all(preprocessingTasks);

      const preprocessTime = Date.now();
      console.log(`✓ Preprocessing completed in ${preprocessTime - startTime}ms`);

      // ============================================
      // PHASE 2: RENDER HTML TEMPLATE
      // ============================================
      let htmlContent;
      let viewName    = '';
      let paperConfig = {};

      viewName = `template${pdfRequest.template_no}`;

      switch (pdfRequest.template_no) {
        case 201:
        case 180:
          // Thermal receipt — 80mm roll, height auto-fits content
          // Override thermal width via paper_width (e.g. '302px' for 80mm, '348px' for 88mm)
          paperConfig = {
            thermalWidth: pdfRequest.paper_width || '302px',
            useHeaderFooter: false
          };
          break;

        case 202:
        case 211:
          // Pre-printed form — custom paper size, background image overlay
          // Override dimensions via paper_width / paper_height (e.g. '220mm' / '280mm')
          paperConfig = {
            width:          pdfRequest.paper_width  || '220mm',
            height:         pdfRequest.paper_height || '280mm',
            useHeaderFooter: false
          };
          if (pdfRequest.template_no === 202) {
            pdfRequest = templateService.prepareRahathData(pdfRequest);
          }
          break;

        default:
          // Standard A4 invoice with optional header/footer images
          paperConfig = { format: 'A4', useHeaderFooter: true };
      }

      // console.log(`viewName: ${viewName} | paperConfig: ${JSON.stringify(paperConfig)}`);

      try {
        htmlContent = await templateService.renderToString(viewName, pdfRequest, docTypeFolder);
        console.log(`✓ Template '${viewName}' rendered. HTML length: ${htmlContent.length}`);
      } catch (renderError) {
        console.error('✗ Template rendering error:', renderError);
        return res.status(500).json({
          error: 'Error rendering template',
          details: renderError.message,
          template: viewName
        });
      }

      const renderTime = Date.now();
      console.log(`✓ HTML rendering completed in ${renderTime - preprocessTime}ms`);

      // ============================================
      // PHASE 3: CONFIGURE PDF OPTIONS
      // ============================================

      // isThermal = no format, no width  → thermal roll (width driven by paper_width)
      // isCustom  = no format, has width → pre-printed custom size
      const isThermal = !paperConfig.format && !paperConfig.width;
      const isCustom  = !paperConfig.format &&  paperConfig.width;

      if (isThermal) {
        const tw = paperConfig.thermalWidth || '302px';
        // Inject CSS + JS to auto-size page height to exact content height
        // Lambda Puppeteer ignores preferCSSPageSize — injecting into HTML is the only guarantee
        htmlContent = htmlContent.replace(
          /<head([^>]*)>/i,
          `<head$1>
    <style id="thermal-page-size">
      @page { size: ${tw} 9999px !important; margin: 0 !important; }
      html, body { width: ${tw} !important; max-width: ${tw} !important; margin: 0 !important; padding: 0 !important; }
    </style>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        var h = document.body.scrollHeight || document.documentElement.scrollHeight;
        document.getElementById('thermal-page-size').textContent =
          '@page { size: ${tw} ' + (h + 10) + 'px !important; margin: 0 !important; }' +
          'html, body { width: ${tw} !important; max-width: ${tw} !important; margin: 0 !important; padding: 0 !important; }';
      });
    </script>`
        );
        console.log(`✓ Thermal CSS + auto-height script injected (${tw})`);
      }

      // Metadata is now handled by pdf-lib after Lambda returns the buffer
      // See Phase 4.5 below — direct binary injection, 100% reliable

      const pdfOptions = {
        printBackground:   true,
        omitBackground:    false,
        preferCSSPageSize: true,
        scale: 1.0,
        ...(isCustom
          ? { width: paperConfig.width, height: paperConfig.height }
          : isThermal
            ? { width: paperConfig.thermalWidth || '302px', height: '1500px' }
            : { format: paperConfig.format }
        )
      };

      // Header/footer images only for standard A4 templates
      const useHeaderFooter = paperConfig.useHeaderFooter && pdfRequest.UseHeaderFooter;

      if (useHeaderFooter) {
        console.log('Configuring PDF with HEADER/FOOTER mode');

        pdfOptions.displayHeaderFooter = true;
         pdfOptions.margin = { top:pdfRequest.datasettings.d74 , bottom: pdfRequest.datasettings.d75, left: '0px', right: '0px' };
        // pdfOptions.margin = { top: '120px', bottom: '5px', left: '15px', right: '15px' };

        const headerFooterTasks = [];

        if (pdfRequest.HeaderImageUrl) {
          headerFooterTasks.push(
            pdfService.headerGenerate(pdfRequest.HeaderImageUrl)
              .then(headerHtml => { pdfOptions.headerTemplate = headerHtml; })
          );
        }

        if (pdfRequest.FooterImageUrl) {
          headerFooterTasks.push(
            pdfService.footerGenerate(pdfRequest.FooterImageUrl)
              .then(footerHtml => { pdfOptions.footerTemplate = footerHtml; })
          );
        }

        if (headerFooterTasks.length > 0) {
          await Promise.all(headerFooterTasks);
        }

      } else {
        const mode = isThermal ? 'THERMAL' : isCustom ? 'CUSTOM SIZE' : 'SIMPLE';
        console.log(`Configuring PDF with ${mode} mode`);

        pdfOptions.displayHeaderFooter = false;
        pdfOptions.margin = (isThermal || isCustom)
          ? { top: '0', bottom: '0', left: '0', right: '0' }
          : { top: '10px', bottom: '10px', left: '10px', right: '10px' };
      }

      const optionsTime = Date.now();
      console.log(`✓ PDF options configured in ${optionsTime - renderTime}ms`);

      // ============================================
      // PHASE 4: CALL AWS LAMBDA TO GENERATE PDF
      // ============================================
      console.log('Calling AWS Lambda to generate PDF...');

      let pdfBuffer;

      try {
        const lambdaResponse = await axios.post(LAMBDA_PDF_API, {
          html: htmlContent,
          options: pdfOptions
        }, {
          responseType: 'arraybuffer',
          timeout: 60000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        });

        pdfBuffer = Buffer.from(lambdaResponse.data);

        const lambdaTime = Date.now();
        console.log(`✓ Lambda PDF generation completed in ${lambdaTime - optionsTime}ms`);
        console.log(`✓ PDF size: ${pdfBuffer.length} bytes`);

      } catch (lambdaError) {
        console.error('✗ Lambda PDF generation failed:', lambdaError.message);

        if (lambdaError.response) {
          console.error('Lambda error response:', lambdaError.response.data);
          return res.status(500).json({
            error: 'Lambda PDF generation failed',
            details: lambdaError.response.data,
            statusCode: lambdaError.response.status
          });
        }

        return res.status(500).json({
          error: 'Failed to call Lambda',
          details: lambdaError.message
        });
      }

      // ── Inject metadata via pdf-lib ──────────────────────

      try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);

        const invNo_m        = pdfRequest.basicdetails?.[0]?.inv_no
                            || pdfRequest.MyInvoisDocument?.document?.inv_no    || '';
        const invDate_m      = pdfRequest.basicdetails?.[0]?.inv_date
                            || pdfRequest.MyInvoisDocument?.document?.inv_date  || '';
        const companyName_m  = (pdfRequest.branch?.[0]?.name
                            || pdfRequest.MyInvoisDocument?.supplier?.name      || '').trim();
        const customerName_m = (pdfRequest.billing_address?.[0]?.name
                            || pdfRequest.MyInvoisDocument?.buyer?.name         || '').trim();

        pdfDoc.setTitle(`Invoice - ${invNo_m}`);
        pdfDoc.setAuthor(companyName_m);
        pdfDoc.setSubject(`Invoice ${invNo_m} dated ${invDate_m}`);
        pdfDoc.setKeywords(['invoice', invNo_m, customerName_m, companyName_m]);
        pdfDoc.setCreator('Ethicfin');
        pdfDoc.setProducer('Ethicfin - Smart Accounting Solutions | www.ethicfin.com');
        pdfDoc.setCreationDate(new Date());
        pdfDoc.setModificationDate(new Date());

        pdfBuffer = Buffer.from(await pdfDoc.save());
        console.log(`✓ PDF metadata written via pdf-lib (${pdfBuffer.length} bytes)`);
      } catch (metaErr) {
        console.error('✗ pdf-lib metadata injection failed:', metaErr.message);
        // pdfBuffer unchanged — still send original PDF
      }

      const endTime   = Date.now();
      const totalTime = endTime - startTime;

      console.log(`✓ Total processing time: ${totalTime}ms`);
      console.log('=== PDF Generation Completed (Lambda Mode) ===\n');

      // ============================================
      // PHASE 5: FILENAME & SEND RESPONSE
      // ============================================
      let fileName = 'document.pdf';

      if (pdfRequest.MyInvoisDocument?.document?.inv_no) {
        const docType    = pdfRequest.MyInvoisDocument?.document_info?.type_name || 'Document';
        const myInvNo    = pdfRequest.MyInvoisDocument.document.inv_no.replace(/[ /]/g, '_');
        const selfBilled = pdfRequest.MyInvoisDocument?.document_info?.is_self_billed ? '_SelfBilled' : '';
        const timestamp  = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
        fileName = `MyInvois_${docType}${selfBilled}_${myInvNo}_${timestamp}.pdf`;

      } else if (pdfRequest.basicdetails?.[0]?.inv_no) {
        const fInvNo = pdfRequest.basicdetails[0].inv_no.replace(/[ /]/g, '_');
        fileName = `Invoice_${fInvNo}_${Date.now()}.pdf`;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('X-PDF-Generation-Time', totalTime.toString());
      res.setHeader('X-PDF-Size', pdfBuffer.length.toString());
      res.setHeader('X-PDF-Document-Type', pdfRequest.MyInvoisDocument?.document_info?.type_display || 'Invoice');
      res.setHeader('X-PDF-Generator', 'AWS-Lambda');

      res.send(pdfBuffer);

    } catch (error) {
      console.error('✗ Unexpected error in PDF generation:', error);
      res.status(500).json({
        error: 'Unexpected error in PDF generation',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Cleanup browser pool endpoint
   */
  // async cleanupBrowserPool(req, res) {
  //   res.json({
  //     message: 'Using AWS Lambda - no browser pool to cleanup',
  //     mode: 'lambda'
  //   });
  // }
}

module.exports = new PdfController();