// core/dataProcessor.js
/**
 * Data processing utilities for Qlik hypercube data
 * UPDATED: Customer name based system
 */

import {
  COLUMN_TYPES,
  WRITEBACK_COLUMNS,
  SPECIAL_COLUMNS,
} from "../utils/constants.js";

/**
 * Process Qlik hypercube data and transform it for the table
 * @param {Object} params - Parameters object
 * @param {Object} params.layout - Qlik layout object
 * @param {Array} params.pageData - Optional page data override
 * @returns {Object} Processed table data with headers and rows
 */
export function processData({ layout, pageData }) {
  console.log("processData: Processing layout data", layout);

  // Use provided pageData if available, otherwise use data from layout
  const qMatrix =
    pageData ||
    (layout.qHyperCube.qDataPages[0]
      ? layout.qHyperCube.qDataPages[0].qMatrix
      : []);
  console.log("processData: Using qMatrix with", qMatrix.length, "rows");

  // Get metadata for dimensions and measures
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
 * @param {number} totalRowCount - Total number of rows
 * @param {number} pageSize - Number of rows per page
 * @param {number} currentPageNum - Current page number
 * @returns {Object} Pagination info object
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
 * @param {Object} layout - Qlik layout object
 * @returns {number} Page size
 */
export function getPageSize(layout) {
  return (
    layout.paginationOptions?.pageSize || layout.tableOptions?.pageSize || 100
  );
}

/**
 * Extract customer name from a row object
 * @param {Object} row - Table row object
 * @param {number} rowIndex - Row index as fallback
 * @param {number} currentPage - Current page number
 * @returns {string} Customer name
 */
export function extractCustomerName(row, rowIndex, currentPage) {
  return (
    row[SPECIAL_COLUMNS.CUSTOMER]?.value ||
    `row-${rowIndex}-page-${currentPage}`
  );
}

/**
 * Generate a unique data key for writeback fields
 * @param {string} customerName - Customer name identifier
 * @param {string} fieldId - Field identifier (status, comments, etc.)
 * @returns {string} Unique data key
 */
export function generateDataKey(customerName, fieldId) {
  return `${customerName}-${fieldId}`;
}

/**
 * Validate customer name for data operations
 * @param {string} customerName - Customer name to validate
 * @returns {boolean} True if customer name is valid
 */
export function validateCustomerName(customerName) {
  return (
    customerName &&
    typeof customerName === "string" &&
    customerName.trim().length > 0 &&
    !customerName.startsWith("row-")
  ); // Exclude fallback names
}

/**
 * Extract field value from row data
 * @param {Object} row - Table row object
 * @param {string} fieldName - Field name to extract
 * @returns {any} Field value or null if not found
 */
export function extractFieldValue(row, fieldName) {
  const field = row[fieldName];
  if (!field) return null;

  // Return numeric value if available, otherwise text value
  return field.qNum !== undefined ? field.qNum : field.value;
}

/**
 * Get all customer names from table rows
 * @param {Array} rows - Array of table row objects
 * @returns {Array} Array of unique customer names
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
 * @param {Array} rows - Array of table row objects
 * @param {string} targetCustomerName - Customer name to find
 * @param {number} currentPage - Current page number
 * @returns {Object|null} Row object or null if not found
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
 * @param {Object} row - Table row object
 * @returns {Object} Object containing all relevant field values
 */
export function extractRowData(row) {
  return {
    customerName: row[SPECIAL_COLUMNS.CUSTOMER]?.value || "",
    amount: parseFloat(row[SPECIAL_COLUMNS.AMOUNT]?.value) || 0,
    agingBucket: row[SPECIAL_COLUMNS.AGING_BUCKETS]?.value || "",
    daysPastDue: parseInt(row[SPECIAL_COLUMNS.DAYS_PAST_DUE]?.value) || 0,
    riskScore:
      parseFloat(row[SPECIAL_COLUMNS.RISK]?.value?.replace("%", "")) || 0,
    // Writeback fields
    modelFeedback: row.status?.value || "",
    comments: row.comments?.value || "",
  };
}
