// const axios = require('axios');
// const templateService = require('../services/templateService');
// const qrCodeService = require('../services/qrCodeService');
// const pdfService = require('../services/pdfService');

// // AWS Lambda API endpoint
// const LAMBDA_PDF_API = 'https://49ov366dtf.execute-api.us-east-1.amazonaws.com/default/puppeteer-pdf-generator';

// class PdfController {
//   /**
//    * Test endpoint (keep as is)
//    */
//   async test(req, res) {
//     try {
//       res.json({
//         message: 'API is working',
//         url: req.path,
//         environment: process.platform,
//         runtime: process.version,
//         nodeEnv: process.env.NODE_ENV,
//         lambdaEndpoint: LAMBDA_PDF_API,
//         timestamp: new Date().toISOString()
//       });
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   }

//   /**
//    * Generate PDF using AWS Lambda
//    */
//   async generatePdfWithRazorView(req, res) {
//     const startTime = Date.now();

//     try {
//       const pdfRequest = req.body;

//       if (!pdfRequest) {
//         return res.status(400).json({ error: 'PDF request data is required' });
//       }

//       console.log('\n=== PDF Generation Started (Lambda Mode) ===');
//       console.log(`Report Type: ${pdfRequest.ReportType}`);

//       // ============================================
//       // PHASE 1: PARALLEL PREPROCESSING
//       // ============================================
//       const preprocessingTasks = [];

//       // ── Task 1: QR Code ──────────────────────────────────
//       // pdfRequest.qrcode is a ZATCA TLV base64 string (not a QR image).
//       // Pass it through qrCodeService to generate the actual PNG QR image.
//       // Flow: ZATCA TLV string → qrCodeService → PNG base64 → <img> in PDF
//       // QR only for templates that need it (not thermal)
//       const needsQr = pdfRequest.ReportType !== 3;
//       if (needsQr && pdfRequest.qrcode && String(pdfRequest.qrcode).length > 0) {
//         console.log('↻ Generating QR image from ZATCA TLV string...');
//         preprocessingTasks.push(
//           qrCodeService.generateQrCodeBase64(pdfRequest.qrcode)
//             .then(base64 => {
//               pdfRequest.qrCodeBase64 = base64;
//               console.log(`✓ QR image generated successfully (${base64.length} chars)`);
//             })
//             .catch(err => {
//               console.error('✗ QR code generation failed:', err.message);
//               pdfRequest.qrCodeBase64 = '';
//             })
//         );
//       } else if (!needsQr) {
//         console.log('✓ QR skipped (not required for this template)');
//       }

//       // ── Task 2: Watermark CSS ────────────────────────────
//       if (pdfRequest.UseBGWatermark && pdfRequest.WatermarkUrl) {
//         preprocessingTasks.push(
//           pdfService.generateWatermarkCss(
//             pdfRequest.WatermarkUrl,
//             pdfRequest.WatermarkOpacity || 0.7
//           )
//             .then(watermarkCss => {
//               pdfRequest.WatermarkCss = watermarkCss;
//               console.log(`✓ Watermark CSS generated (opacity: ${pdfRequest.WatermarkOpacity || 0.7})`);
//             })
//             .catch(err => console.error('✗ Watermark generation failed:', err))
//         );
//       }

//       // ── Task 3: MyInvois QR (unchanged) ─────────────────
//       if (pdfRequest.MyInvoisDocument?.myinvois) {
//         const myinvois = pdfRequest.MyInvoisDocument.myinvois;
//         if (!myinvois.qr_code && myinvois.uuid && myinvois.long_id) {
//           preprocessingTasks.push(
//             qrCodeService.generateMyInvoisQr(myinvois.uuid, myinvois.long_id)
//               .then(qrDataUri => {
//                 myinvois.qr_code = qrDataUri;
//                 console.log('✓ MyInvois QR generated successfully');
//               })
//               .catch(err => console.error('✗ MyInvois QR generation failed:', err))
//           );
//         }
//       }

//       // Wait for all preprocessing tasks
//       await Promise.all(preprocessingTasks);

//       const preprocessTime = Date.now();
//       console.log(`✓ Preprocessing completed in ${preprocessTime - startTime}ms`);

//       // ============================================
//       // PHASE 2: RENDER HTML TEMPLATE
//       // ============================================
//       let htmlContent;
//       let viewName = '';

//       // paperConfig drives pdfOptions below:
//       //   format           → named size (A4, Letter)
//       //   width/height     → exact size for thermal rolls
//       //   useHeaderFooter  → false for thermal (no header/footer images)
//       let paperConfig = {};

//       switch (pdfRequest.ReportType) {
//         case 1:
//           viewName = 'ksa/default';
//           paperConfig = { format: 'A4', useHeaderFooter: true };
//           break;
//         case 2:
//           viewName = 'myinvois_doc';
//           paperConfig = { format: 'A4', useHeaderFooter: true };
//           const docType    = pdfRequest.MyInvoisDocument?.document_info?.type_display || 'Document';
//           const isSelfBilled = pdfRequest.MyInvoisDocument?.document_info?.is_self_billed || false;
//           console.log(`Using MyInvois template for ${docType}${isSelfBilled ? ' (Self-Billed)' : ''}`);
//           break;
//         case 3:
//           // Thermal receipt — 80mm wide, height auto-fits content
//           viewName = 'qatar/thermal';
//           paperConfig = { useHeaderFooter: false }; // no format = preferCSSPageSize handles it
//           break;
//         default:
//           return res.status(400).json({ error: `Unknown ReportType: ${pdfRequest.ReportType}` });
//       }

//       console.log(`Template: ${viewName} | Paper: ${JSON.stringify(paperConfig)}`);

//       try {
//         htmlContent = await templateService.renderToString(viewName, pdfRequest);
//         console.log(`✓ Template '${viewName}' rendered. HTML length: ${htmlContent.length}`);
//       } catch (renderError) {
//         console.error('✗ Template rendering error:', renderError);
//         return res.status(500).json({
//           error: 'Error rendering template',
//           details: renderError.message,
//           template: viewName
//         });
//       }

//       const renderTime = Date.now();
//       console.log(`✓ HTML rendering completed in ${renderTime - preprocessTime}ms`);

//       // ============================================
//       // PHASE 3: CONFIGURE PDF OPTIONS
//       // ============================================

//       // ── Paper size strategy ─────────────────────────────────
//       // Lambda Puppeteer may not honour preferCSSPageSize reliably.
//       // Safest approach:
//       //   A4 thermal → inject @page CSS directly into the HTML  +  pass width to Puppeteer
//       //   A4 normal  → pass format:'A4'  (standard, always works)
//       //
//       // For thermal we also inject a <style> block into htmlContent so that
//       // even if Lambda Puppeteer ignores pdfOptions width it still renders correctly.
//       const isThermal = !paperConfig.format;

//       if (isThermal) {
//         // ── Thermal page size: inject into HTML — do NOT rely on Lambda pdfOptions ──
//         // Lambda's Puppeteer version may ignore width/height/preferCSSPageSize.
//         // Injecting a <style> directly into the HTML string is the only guaranteed way.
//         // We replace the entire <head> opening so this is always the FIRST style rule.
//         // Inject CSS + a script that resizes @page to exact content height.
//         // The script runs before Puppeteer prints, measures document.body.scrollHeight
//         // and writes it back into a <style> tag — so the PDF height = content height exactly.
//         htmlContent = htmlContent.replace(
//           /<head([^>]*)>/i,
//           `<head$1>
// <style id=thermal-page-size>
//   @page { size: 302px 9999px !important; margin: 0 !important; }
//   html, body { width: 302px !important; max-width: 302px !important; margin: 0 !important; padding: 0 !important; }
// </style>
// <script>
//   // Runs immediately — adjusts @page height to exact content height before print
//   document.addEventListener('DOMContentLoaded', function() {
//     var h = document.body.scrollHeight || document.documentElement.scrollHeight;
//     document.getElementById('thermal-page-size').textContent =
//       '@page { size: 302px ' + (h + 10) + 'px !important; margin: 0 !important; }' +
//       'html, body { width: 302px !important; max-width: 302px !important; margin: 0 !important; padding: 0 !important; }';
//   });
// </script>`
//         );
//         console.log('✓ Thermal CSS + auto-height script injected (302px = 80mm)');
//       }

//       const pdfOptions = {
//         printBackground: true,
//         omitBackground: false,
//         preferCSSPageSize: true,
//         scale: 1.0,
//         ...(isThermal
//           ? { width: '302px', height: '1500px' }  // script corrects to exact content height
//           : { format: paperConfig.format }
//         )
//       };

//       // Header/footer only for A4 templates, never for thermal
//       const useHeaderFooter = paperConfig.useHeaderFooter && pdfRequest.UseHeaderFooter;

//       if (useHeaderFooter) {
//         console.log('Configuring PDF with HEADER/FOOTER mode');

//         pdfOptions.displayHeaderFooter = true;
//         pdfOptions.margin = {
//           top: '120px',
//           bottom: '5px',
//           left: '5px',
//           right: '5px'
//         };

//         const headerFooterTasks = [];

//         if (pdfRequest.HeaderImageUrl) {
//           headerFooterTasks.push(
//             pdfService.headerGenerate(pdfRequest.HeaderImageUrl)
//               .then(headerHtml => { pdfOptions.headerTemplate = headerHtml; })
//           );
//         }

//         if (pdfRequest.FooterImageUrl) {
//           headerFooterTasks.push(
//             pdfService.footerGenerate(pdfRequest.FooterImageUrl)
//               .then(footerHtml => { pdfOptions.footerTemplate = footerHtml; })
//           );
//         }

//         if (headerFooterTasks.length > 0) {
//           await Promise.all(headerFooterTasks);
//         }
//       } else {
//         // Simple mode — used for thermal and any template without header/footer
//         const isThermal = !paperConfig.format;
//         console.log(isThermal ? 'Configuring PDF with THERMAL mode' : 'Configuring PDF with SIMPLE mode');

//         pdfOptions.displayHeaderFooter = false;
//         pdfOptions.margin = isThermal
//           ? { top: '0', bottom: '0', left: '0', right: '0' }
//           : { top: '10px', bottom: '10px', left: '10px', right: '10px' };
//       }

//       const optionsTime = Date.now();
//       console.log(`✓ PDF options configured in ${optionsTime - renderTime}ms`);

//       // ============================================
//       // PHASE 4: CALL AWS LAMBDA TO GENERATE PDF (unchanged)
//       // ============================================
//       console.log('Calling AWS Lambda to generate PDF...');

//       let pdfBuffer;

//       try {
//         const lambdaResponse = await axios.post(LAMBDA_PDF_API, {
//           html: htmlContent,
//           options: pdfOptions
//         }, {
//           responseType: 'arraybuffer',
//           timeout: 60000,
//           maxContentLength: Infinity,
//           maxBodyLength: Infinity
//         });

//         pdfBuffer = Buffer.from(lambdaResponse.data);

//         const lambdaTime = Date.now();
//         console.log(`✓ Lambda PDF generation completed in ${lambdaTime - optionsTime}ms`);
//         console.log(`✓ PDF size: ${pdfBuffer.length} bytes`);

//       } catch (lambdaError) {
//         console.error('✗ Lambda PDF generation failed:', lambdaError.message);

//         if (lambdaError.response) {
//           console.error('Lambda error response:', lambdaError.response.data);
//           return res.status(500).json({
//             error: 'Lambda PDF generation failed',
//             details: lambdaError.response.data,
//             statusCode: lambdaError.response.status
//           });
//         }

//         return res.status(500).json({
//           error: 'Failed to call Lambda',
//           details: lambdaError.message
//         });
//       }

//       const endTime   = Date.now();
//       const totalTime = endTime - startTime;

//       console.log(`✓ Total processing time: ${totalTime}ms`);
//       console.log('=== PDF Generation Completed (Lambda Mode) ===\n');

//       // ============================================
//       // PHASE 5: FILENAME & SEND RESPONSE
//       // ============================================
//       let fileName = 'document.pdf';

//       // MyInvois filename
//       if (pdfRequest.MyInvoisDocument?.document?.inv_no) {
//         const docType   = pdfRequest.MyInvoisDocument?.document_info?.type_name || 'Document';
//         const invNo     = pdfRequest.MyInvoisDocument.document.inv_no.replace(/[ /]/g, '_');
//         const selfBilled = pdfRequest.MyInvoisDocument?.document_info?.is_self_billed ? '_SelfBilled' : '';
//         const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
//         fileName = `MyInvois_${docType}${selfBilled}_${invNo}_${timestamp}.pdf`;

//       // KSA invoice filename
//       } else if (pdfRequest.basicdetails?.[0]?.inv_no) {
//         const invNo = pdfRequest.basicdetails[0].inv_no.replace(/[ /]/g, '_');
//         fileName = `Invoice_${invNo}_${Date.now()}.pdf`;
//       }

//       res.setHeader('Content-Type', 'application/pdf');
//       res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
//       res.setHeader('X-PDF-Generation-Time', totalTime.toString());
//       res.setHeader('X-PDF-Size', pdfBuffer.length.toString());
//       res.setHeader('X-PDF-Document-Type', pdfRequest.MyInvoisDocument?.document_info?.type_display || 'Invoice');
//       res.setHeader('X-PDF-Generator', 'AWS-Lambda');

//       res.send(pdfBuffer);

//     } catch (error) {
//       console.error('✗ Unexpected error in PDF generation:', error);
//       res.status(500).json({
//         error: 'Unexpected error in PDF generation',
//         details: error.message,
//         stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
//       });
//     }
//   }

//   /**
//    * Cleanup browser pool endpoint
//    */
//   async cleanupBrowserPool(req, res) {
//     res.json({
//       message: 'Using AWS Lambda - no browser pool to cleanup',
//       mode: 'lambda'
//     });
//   }
// }

// module.exports = new PdfController();