'use strict';

const DOC_TYPES = {
  1: { folder: 'invoice',     label: 'Invoice' },
  2: { folder: 'sales_quote', label: 'Sales Quote' },
  3: { folder: 'proforma',    label: 'Proforma Invoice' },
  4: { folder: 'purchase',    label: 'Purchase Order' },
};

const DEFAULT_DOC_TYPE = 1;

function getDocTypeInfo(docType) {
  return DOC_TYPES[docType] || DOC_TYPES[DEFAULT_DOC_TYPE];
}

module.exports = { DOC_TYPES, DEFAULT_DOC_TYPE, getDocTypeInfo };
