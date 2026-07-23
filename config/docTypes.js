'use strict';

const DOC_TYPES = {
  1: { folder: 'invoice',     label: 'Invoice' },
  2: { folder: 'sales_quote', label: 'Sales Quote' },
  3: { folder: 'proforma',    label: 'Proforma Invoice' },
  4: { folder: 'salesorder',  label: 'Sales Order' },
  5: { folder: 'purchaseorder',    label: 'Purchase Order' },
  6: { folder: 'Purchase',    label: 'Purchase' },
  7: { folder: 'Creditnote',    label: 'Credit Note' },
  8: { folder: 'Purchasereturn',    label: 'Purchase Return' },
  9: { folder: 'Salesereturn',    label: 'Sales Return' },
  10: { folder: 'Deliverynote',    label: 'Delivery Note' },
};

const DEFAULT_DOC_TYPE = 1;

function getDocTypeInfo(docType) {
  return DOC_TYPES[docType] || DOC_TYPES[DEFAULT_DOC_TYPE];
}

module.exports = { DOC_TYPES, DEFAULT_DOC_TYPE, getDocTypeInfo };
