'use strict';

// Maps report_type (int sent from PHP) → template name prefix + label
// Template file resolved as: reports/{name}{template_no}.hbs
// e.g. report_type=1, template_no=2  →  reports/project_report2.hbs

const REPORT_TYPES = {
  1: { name: 'project_report',   label: 'Project Report'   },
  2: { name: 'sales_report',     label: 'Sales Report'     },
  3: { name: 'products_report',  label: 'Products Report'  },
  4: { name: 'customers_report', label: 'Customers Report' },
};

const DEFAULT_REPORT_TYPE = 1;

function getReportTypeInfo(reportType) {
  return REPORT_TYPES[reportType] || REPORT_TYPES[DEFAULT_REPORT_TYPE];
}

module.exports = { REPORT_TYPES, DEFAULT_REPORT_TYPE, getReportTypeInfo };
