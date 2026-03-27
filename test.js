const http = require('http');
const fs = require('fs');
const path = require('path');

// Sample MyInvois test data
const sampleRequest = {
  ReportType: 7,
  UseBGWatermark: false,
  UseHeaderFooter: false,
  MyInvoisDocument: {
    DocumentInfo: {
      TypeCode: 1,
      TypeName: 'Invoice',
      TypeDisplay: 'Invoice',
      Version: 'v1.1',
      IsSelfBilled: false,
      HasOriginalReference: false,
      ColorCode: '#2563eb'
    },
    Document: {
      Id: 1,
      InvNo: 'INV-2024-001',
      InvDate: '2024-01-15T10:30:00',
      GrandTotal: 1180.00,
      Vat: 80.00,
      Total: 1000.00,
      Dld: 0,
      Dlc: 0
    },
    DocDetails: {
      Uuid: '123e4567-e89b-12d3-a456-426614174000',
      CurrencyCode: 'MYR',
      ExchangeRate: '1.00'
    },
    Supplier: {
      Name: 'ABC TRADING SDN BHD',
      Tin: 'C12345678901234',
      Email: 'info@abctrading.com',
      ContactNo: '+60123456789',
      AddressFormatted: 'No 123, Jalan Merdeka\nTaman Sentosa\n50000 Kuala Lumpur\nMalaysia',
      MsicCode: '46900',
      MsicDescription: 'Wholesale trade'
    },
    Buyer: {
      Name: 'XYZ ENTERPRISE',
      Tin: 'C98765432109876',
      Email: 'buyer@xyz.com',
      ContactNo: '+60198765432',
      AddressFormatted: 'No 456, Jalan Raja\nBukit Bintang\n55000 Kuala Lumpur\nMalaysia'
    },
    Items: [
      {
        Id: 1,
        ItemName: 'Product A',
        Description: 'High quality product',
        Quantity: 10,
        UnitCode: 'EA',
        Price: 100.00,
        Taxable: 1000.00,
        DiscAmt: 0,
        ChargeAmt: 0,
        VatAmt: 80.00,
        VatPerc: 8,
        DiscPerc: 0,
        ChargePerc: 0,
        ClassificationCodes: [
          { Code: '001', Description: 'Category A' }
        ],
        TaxTypes: [
          {
            TaxCode: 'SST',
            TaxName: 'Sales and Service Tax',
            Rate: 8,
            TaxAmt: 80.00,
            TaxableAmt: 1000.00
          }
        ]
      }
    ],
    Myinvois: {
      Uuid: '123e4567-e89b-12d3-a456-426614174000',
      LongId: 'ABC123456789XYZ',
      SubmissionUid: 'SUB-123-456',
      QrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      IssuanceDate: '2024-01-15T10:30:00',
      SubmissionDate: '2024-01-15T10:35:00',
      ValidationDate: '2024-01-15T10:40:00'
    }
  }
};

// Test function
async function testPdfGeneration() {
  console.log('='.repeat(60));
  console.log('PDF Service Test');
  console.log('='.repeat(60));

  const postData = JSON.stringify(sampleRequest);
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/pdf/razor-view-pdf',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    console.log('\nSending request to PDF service...');
    console.log(`URL: http://${options.hostname}:${options.port}${options.path}`);
    
    const req = http.request(options, (res) => {
      console.log(`\nResponse Status: ${res.statusCode}`);
      console.log('Response Headers:', res.headers);

      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        if (res.statusCode === 200) {
          // Save PDF
          const outputPath = path.join(__dirname, 'test-output.pdf');
          fs.writeFileSync(outputPath, buffer);
          
          console.log('\n' + '='.repeat(60));
          console.log('✓ SUCCESS!');
          console.log('='.repeat(60));
          console.log(`PDF saved to: ${outputPath}`);
          console.log(`File size: ${buffer.length} bytes`);
          console.log('='.repeat(60) + '\n');
          
          resolve(outputPath);
        } else {
          console.log('\n' + '='.repeat(60));
          console.log('✗ FAILED!');
          console.log('='.repeat(60));
          console.log('Response:', buffer.toString());
          console.log('='.repeat(60) + '\n');
          
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.log('\n' + '='.repeat(60));
      console.log('✗ CONNECTION ERROR!');
      console.log('='.repeat(60));
      console.log('Error:', error.message);
      console.log('\nMake sure the server is running:');
      console.log('  npm start');
      console.log('='.repeat(60) + '\n');
      
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Run test
async function main() {
  try {
    // Test 1: Health check
    console.log('Test 1: Health Check');
    await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/pdf/test', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log('✓ Server is running');
          console.log(JSON.parse(data));
          resolve();
        });
      }).on('error', reject);
    });

    console.log('\n');

    // Test 2: PDF Generation
    console.log('Test 2: PDF Generation');
    await testPdfGeneration();

  } catch (error) {
    console.error('\nTest failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { testPdfGeneration, sampleRequest };
