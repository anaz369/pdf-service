const templateService = require('./services/templateService');
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scratch_data63.json','utf8')).data;
data.Seal = ''; data.Signature = '';
templateService.renderToString('template63', data, 'proforma')
  .then(html => { fs.writeFileSync('scratch_out63.html', html); console.log('OK length', html.length); })
  .catch(e => { console.error('ERR', e.message); process.exit(1); });
