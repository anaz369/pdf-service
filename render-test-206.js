const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

Handlebars.registerHelper('formatAmount', function (value, decimals) {
  const dp = (typeof decimals === 'number') ? decimals : 2;
  const num = parseFloat(String(value || '0').replace(/,/g, '')) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
});
Handlebars.registerHelper('divide', (a, b) =>
  (parseFloat(String(a || 0).replace(/,/g, '')) || 0) /
  (parseFloat(String(b || 1).replace(/,/g, '')) || 1)
);
Handlebars.registerHelper('addOne', (v) => parseInt(v, 10) + 1);
Handlebars.registerHelper('nl2br', (t) => t ? new Handlebars.SafeString(String(t).replace(/\n/g, '<br/>')) : '');

const apiData = {
  basicdetails: [{
    id: "49", ccrate: "1", reference: "1333", sup_date: "06-Mar-2026",
    inv_date: "03-Mar-2026", inv_no: "MINU000021INV", vatamt: "1297.28",
    discount: "111.5", subtotal: "8648.5", grand_total: "9946",
    currency_isocode: "AED", base_country_isocode: "SAR",
    branchname: "HANNA COMPANY ", salesman_name: "EMP A"
  }],
  itemdetails: [
    { item_name: "Bolt  x", name_lang2: "item second lang2", description: "Bolt  xkklio", price: "30.00", quantity: "12", vat_perc: "15", amount: "414.00", unit: "KGS" },
    { item_name: "Note Book", price: "2,230.00", quantity: "1", vat_perc: "15", amount: "2,436.28", unit: "DOZ" },
    { item_name: "PRO02", price: "900.00", quantity: "1", vat_perc: "15", amount: "1,035.00", unit: "CTN" },
    { item_name: "test-access-product", price: "250.00", quantity: "1", vat_perc: "15", amount: "287.50", unit: "BAL" },
    { item_name: "HANNAA PRODYTCC", price: "500.00", quantity: "1", vat_perc: "15", amount: "575.00", unit: "hr" },
    { item_name: "hitech prodduct", price: "280.00", quantity: "10", vat_perc: "15", amount: "3,220.00" },
    { item_name: "test-access-product", price: "260.00", quantity: "1", vat_perc: "15", amount: "299.00", unit: "BAL" },
    { item_name: "Products for testing", price: "560.00", quantity: "1", vat_perc: "15", amount: "644.00" },
    { item_name: "PRO02", price: "900.00", quantity: "1", vat_perc: "15", amount: "1,035.00", unit: "CTN" }
  ],
  bcdp: "2",
  branch: [{
    name: "HANNA COMPANY ", address_line1: "4521", address_line2: "King Abdu Aziz Road",
    address_line3: "Dammam", address_line4: "Al Khobar", address_line5: "Saudi Arabia",
    cr_no: "316836186318", vat: "30008687268326822"
  }],
  branch_lang2: [{ name: "شركة هانا" }],
  billing_address: [{
    name: "Added 1 - cloud EDITED (Id 161)", address_line1: "7340",
    address_line2: "AL OLAYA", address_line3: "AL OLAYA DIST",
    address_line4: "Dammam", address_line5: "Saudi Arabia",
    vat: "310588313300003"
  }],
  compprof: {
    name: "HANNA COMPANY ", cr_no: "316836186318", gstin: "30008687268326822",
    email: "hanna@company.com", website: "HANNA.COM"
  },
  companylogo: "https://accounts.ethicfin.com/uploads/logo/image-63a7fe74f708eaa261c626b1dfc9f5f8.jpg",
  qrcode: "AQ5IQU5OQSBDT01QQU5ZIAIRMzAwMDg2ODcyNjgzMjY4MjIDFDIwMjYtMDMtMDNUMDA6MDA6MDBaBAQ5OTQ2BQcxMjk3LjI4",
  bcamountinwords: "UAE Dirham Nine Thousand Nine Hundred Forty-Six",
  ccrate: 1
};

const tpl = Handlebars.compile(
  fs.readFileSync(path.join(__dirname, 'templates', 'invoice', 'template206.hbs'), 'utf8')
);
const html = tpl(apiData);
const out = path.join(__dirname, 'template206-rendered.html');
fs.writeFileSync(out, html, 'utf8');
console.log('Rendered output:', out);
console.log('Size:', html.length, 'bytes');
