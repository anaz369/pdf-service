// test-watermark.js
const pdfService = require('./src/services/pdfService');

async function testWatermark() {
  console.log('='.repeat(60));
  console.log('WATERMARK DEBUG TEST');
  console.log('='.repeat(60));

  const watermarkUrl = 'https://accounts.ethicfin.com/uploads/profile/doc-e4c9b295b2bd2af9b970a1dc3ea638f7.jpeg';
  
  console.log('\n1. Testing watermark URL accessibility...');
  console.log(`   URL: ${watermarkUrl}`);
  
  try {
    console.log('\n2. Downloading and processing image...');
    const imageBytes = await pdfService.getHighQualityImageBytes(watermarkUrl, 1.0);
    
    if (!imageBytes) {
      console.log('   ✗ FAILED: Image bytes are NULL');
      console.log('   Possible reasons:');
      console.log('   - URL is not accessible');
      console.log('   - Network error');
      console.log('   - Image format not supported');
      return;
    }
    
    console.log(`   ✓ Image downloaded: ${imageBytes.length} bytes`);
    
    console.log('\n3. Generating data URI...');
    const base64 = imageBytes.toString('base64');
    console.log(`   ✓ Base64 length: ${base64.length} characters`);
    
    const dataUri = `data:image/jpeg;base64,${base64}`;
    console.log(`   ✓ Data URI length: ${dataUri.length} characters`);
    console.log(`   ✓ Data URI preview: ${dataUri.substring(0, 60)}...`);
    
    console.log('\n4. Testing generateWatermarkCss method...');
    const watermarkCss = await pdfService.generateWatermarkCss(watermarkUrl, 1.0);
    
    if (!watermarkCss) {
      console.log('   ✗ FAILED: WatermarkCss is empty');
      return;
    }
    
    console.log(`   ✓ WatermarkCss generated: ${watermarkCss.length} characters`);
    console.log(`   ✓ Preview: ${watermarkCss.substring(0, 80)}...`);
    
    console.log('\n5. Testing with different opacity...');
    const watermarkCss2 = await pdfService.generateWatermarkCss(watermarkUrl, 0.3);
    console.log(`   ✓ Opacity 0.3: ${watermarkCss2.length} characters`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ WATERMARK TEST PASSED!');
    console.log('='.repeat(60));
    console.log('\nThe watermark image is accessible and processing correctly.');
    console.log('If watermark still not showing in PDF, the issue is in:');
    console.log('  1. Template not receiving WatermarkCss variable');
    console.log('  2. UseBGWatermark flag not set to true');
    console.log('  3. Puppeteer PDF rendering issue');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.log('\n' + '='.repeat(60));
    console.log('✗ WATERMARK TEST FAILED!');
    console.log('='.repeat(60));
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    console.log('\nPossible solutions:');
    console.log('  1. Check if URL is accessible from server');
    console.log('  2. Try a different image URL');
    console.log('  3. Check network/firewall settings');
    console.log('='.repeat(60));
  }
}

// Run test
testWatermark();
