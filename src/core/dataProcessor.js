// core/dataProcessor.js
/**
 * Data processing utilities for Qlik hypercube data
 * UPDATED: New field mappings for invoice-based data structure
 */

import {
  COLUMN_TYPES,
  WRITEBACK_COLUMNS,
  SPECIAL_COLUMNS,
} from "../utils/constants.js";

/**
 * Process Qlik hypercube data and transform it for the table
 */
export function processData({ layout, pageData }) {
  console.log("processData: Processing layout data", layout);

  const qMatrix =
    pageData ||
    (layout.qHyperCube.qDataPages[0]
      ? layout.qHyperCube.qDataPages[0].qMatrix
      : []);
  console.log("processData: Using qMatrix with", qMatrix.length, "rows");

  const dimensions = layout.qHyperCube.qDimensionInfo || [];
  const measures = layout.qHyperCube.qMeasureInfo || [];
  console.log("processData: Dimensions and Measures", { dimensions, measures });

  // Create headers array for the table
  const headers = [
    // Convert Qlik dimensions to table headers
    ...dimensions.map((dim, dimIndex) => ({
      id: dim.qFallbackTitle,
      label:
        layout.customLabels?.dimensions?.[dimIndex] ||
        dim.qLabel ||
        dim.qLabelExpression ||
        dim.qFallbackTitle,
      type: COLUMN_TYPES.DIMENSION,
      meta: {
        description: dim.qDesc,
        fieldName: dim.qGroupFieldDefs?.[0],
        isCustomLabel: !!layout.customLabels?.dimensions?.[dimIndex],
        sortDirection:
          dim.qSortIndicator === "A"
            ? "asc"
            : dim.qSortIndicator === "D"
            ? "desc"
            : "",
      },
    })),
    // Convert Qlik measures to table headers
    ...measures.map((meas, measIndex) => ({
      id: meas.qFallbackTitle,
      label:
        layout.customLabels?.measures?.[measIndex] ||
        meas.qLabel ||
        meas.qLabelExpression ||
        meas.qFallbackTitle,
      type: COLUMN_TYPES.MEASURE,
      meta: {
        description: meas.qDesc,
        expression: meas.qDef,
        isCustomLabel: !!layout.customLabels?.measures?.[measIndex],
        sortDirection: "",
      },
    })),
  ];

  // Add writeback columns if enabled
  if (layout.tableOptions?.allowWriteback) {
    headers.push(
      {
        id: WRITEBACK_COLUMNS.STATUS,
        label: layout.columnLabels?.status || "Model Feedback",
        type: COLUMN_TYPES.WRITEBACK,
      },
      {
        id: WRITEBACK_COLUMNS.COMMENTS,
        label: layout.columnLabels?.comments || "Comments",
        type: COLUMN_TYPES.WRITEBACK,
      }
    );
  }

  console.log("processData: Generated headers", headers);

  // Transform the Qlik data matrix into row objects
  const rows = qMatrix.map((row, rowIndex) => {
    const formattedRow = {};

    // Process dimension values
    dimensions.forEach((dim, dimIndex) => {
      formattedRow[dim.qFallbackTitle] = {
        value: row[dimIndex].qText,
        qElemNumber: row[dimIndex].qElemNumber,
        selectable: true,
      };
    });

    // Process measure values
    measures.forEach((meas, measIndex) => {
      const dimCount = dimensions.length;
      formattedRow[meas.qFallbackTitle] = {
        value: row[dimCount + measIndex].qText,
        qNum: row[dimCount + measIndex].qNum,
        selectable: false,
      };
    });

    // Add empty writeback columns if enabled
    if (layout.tableOptions?.allowWriteback) {
      formattedRow[WRITEBACK_COLUMNS.STATUS] = {
        value: "",
        editable: true,
      };
      formattedRow[WRITEBACK_COLUMNS.COMMENTS] = {
        value: "",
        editable: true,
      };
    }

    return formattedRow;
  });

  console.log("processData: Formatted rows", rows);

  return {
    headers,
    rows,
  };
}

/**
 * Calculate pagination information
 */
export function calculatePaginationInfo(
  totalRowCount,
  pageSize,
  currentPageNum
) {
  const totalPages = Math.max(1, Math.ceil(totalRowCount / pageSize));
  const firstRow = Math.min((currentPageNum - 1) * pageSize + 1, totalRowCount);
  const lastRow = Math.min(currentPageNum * pageSize, totalRowCount);

  return {
    pageSize,
    totalPages,
    currentPageFirstRow: firstRow,
    currentPageLastRow: lastRow,
  };
}

/**
 * Get page size from layout properties with fallback
 */
export function getPageSize(layout) {
  return (
    layout.paginationOptions?.pageSize || layout.tableOptions?.pageSize || 100
  );
}

/**
 * Extract customer name from a row object
 * @param {Object} row - Row object
 * @param {number} rowIndex - Row index
 * @param {number} currentPage - Current page number
 * @returns {string} Customer name for identification
 */
export function extractCustomerName(row, rowIndex, currentPage) {
  return (
    row[SPECIAL_COLUMNS.CUSTOMER]?.value ||
    `row-${rowIndex}-page-${currentPage}`
  );
}

/**
 * Generate a unique data key for writeback fields
 * Now uses composite key: customerName + invoiceId
 * @param {Object} row - Row object containing customer and invoice data
 * @param {string} fieldId - Field identifier (status or comments)
 * @returns {string} Unique key for the field
 */
export function generateDataKey(row, fieldId) {
  const customerName = row[SPECIAL_COLUMNS.CUSTOMER]?.value || "";
  const invoiceId = row[SPECIAL_COLUMNS.INVOICE_ID]?.value || "";

  // Create composite key
  return `${customerName}::${invoiceId}::${fieldId}`;
}

/**
 * Generate a simple data key (for backward compatibility)
 * @param {string} customerName - Customer name
 * @param {string} fieldId - Field identifier
 * @returns {string} Data key
 */
export function generateSimpleDataKey(customerName, fieldId) {
  return `${customerName}-${fieldId}`;
}

/**
 * Validate customer name for data operations
 */
export function validateCustomerName(customerName) {
  return (
    customerName &&
    typeof customerName === "string" &&
    customerName.trim().length > 0 &&
    !customerName.startsWith("row-")
  );
}

/**
 * Extract field value from row data
 */
export function extractFieldValue(row, fieldName) {
  const field = row[fieldName];
  if (!field) return null;

  return field.qNum !== undefined ? field.qNum : field.value;
}

/**
 * Get all customer names from table rows
 */
export function getUniqueCustomerNames(rows) {
  const customerNames = new Set();

  rows.forEach((row, index) => {
    const customerName = extractCustomerName(row, index, 1);
    if (validateCustomerName(customerName)) {
      customerNames.add(customerName);
    }
  });

  return Array.from(customerNames);
}

/**
 * Find row by customer name
 */
export function findRowByCustomerName(
  rows,
  targetCustomerName,
  currentPage = 1
) {
  return (
    rows.find((row, index) => {
      const customerName = extractCustomerName(row, index, currentPage);
      return customerName === targetCustomerName;
    }) || null
  );
}

/**
 * Extract all data fields from a row for database operations
 * UPDATED: Extract your 7 specific columns
 */
export function extractRowData(row) {
  return {
    // Your 7 core columns
    customerName: row[SPECIAL_COLUMNS.CUSTOMER]?.value || "",
    invoiceId: row[SPECIAL_COLUMNS.INVOICE_ID]?.value || "",
    currentAgingBucket: row[SPECIAL_COLUMNS.CURRENT_AGING_BUCKET]?.value || "",
    predictedPaymentBucket:
      row[SPECIAL_COLUMNS.PREDICTED_PAYMENT_BUCKET]?.value || "",
    paymentTerms: row[SPECIAL_COLUMNS.PAYMENT_TERMS]?.value || "",
    invoiceDueDate: row[SPECIAL_COLUMNS.INVOICE_DUE_DATE]?.value || "",
    amount: parseFloat(row[SPECIAL_COLUMNS.AMOUNT]?.value) || 0,

    // Writeback fields
    modelFeedback: row.status?.value || "",
    comments: row.comments?.value || "",
  };
}

/**
 * Format date for display
 */
export function formatDateForDisplay(dateValue) {
  if (!dateValue) return "";

  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return dateValue; // Return original if invalid

    return date.toLocaleDateString(); // Use local format
  } catch (error) {
    return dateValue; // Return original if error
  }
}

/**
 * Format currency for display
 */
export function formatCurrencyForDisplay(amount) {
  if (amount === null || amount === undefined) return "";

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) return amount.toString();

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numAmount);
}

/**
 * Parse numeric value from text (handles currency symbols, commas, etc.)
 */
export function parseNumericValue(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  // Remove currency symbols, commas, and other non-numeric characters except decimal point
  const cleaned = value.toString().replace(/[^\d.-]/g, "");
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? 0 : parsed;
}
