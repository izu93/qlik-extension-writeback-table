// backend/mergeService.js
import { SPECIAL_COLUMNS } from "../utils/constants.js";

/**
 * Merge writeback data into table rows
 * @param {Array} tableRows - Array of table row objects
 * @param {Array} writebackRows - Array of writeback records from database
 * @returns {Array} Merged table rows with writeback data
 */
export function mergeWritebackData(tableRows, writebackRows) {
  console.log("Starting merge process...");
  console.log("Table rows count:", tableRows?.length || 0);
  console.log("Writeback rows count:", writebackRows?.length || 0);

  if (!tableRows || !Array.isArray(tableRows) || tableRows.length === 0) {
    console.log("No table rows to merge");
    return tableRows || [];
  }

  if (
    !writebackRows ||
    !Array.isArray(writebackRows) ||
    writebackRows.length === 0
  ) {
    console.log("No writeback data to merge");
    return tableRows;
  }

  // Create a map for faster lookups - using composite key (customer + invoice)
  const wbMap = createWritebackMap(writebackRows);

  // Merge the data
  const mergedRows = tableRows.map((row, rowIndex) => {
    // Get both customer name and invoice ID for unique identification
    const customerName = extractCustomerNameFromRow(row);
    const invoiceId = extractInvoiceIdFromRow(row);

    console.log(
      `Row ${rowIndex} - Customer: ${customerName}, Invoice: ${invoiceId}`
    );

    if (!customerName) {
      console.log(`Row ${rowIndex} - No customer name found, skipping merge`);
      return row;
    }

    // Try to find matching writeback data using composite key
    const wb = findWritebackMatch(wbMap, customerName, invoiceId);

    if (wb) {
      console.log(`Row ${rowIndex} - Found matching writeback:`, wb);
      return mergeRowWithWriteback(row, wb, rowIndex);
    } else {
      console.log(
        `Row ${rowIndex} - No matching writeback found for customer: ${customerName}, invoice: ${invoiceId}`
      );
      return row; // Return original row unchanged
    }
  });

  console.log("Merge completed successfully");
  console.log(
    "Rows with writeback data:",
    mergedRows.filter(
      (row) =>
        (row.status?.value && row.status.value !== "") ||
        (row.comments?.value && row.comments.value !== "")
    ).length
  );

  return mergedRows;
}

/**
 * Create a map of writeback data for efficient lookups
 * @param {Array} writebackRows - Array of writeback records
 * @returns {Map} Map with composite keys (customer+invoice) and latest records as values
 */
function createWritebackMap(writebackRows) {
  const wbMap = new Map();
  const compositeKeyGroups = {};

  writebackRows.forEach((r, index) => {
    console.log(`Processing writeback row ${index}:`, r);

    const customerName = r.customer_name;
    const invoiceId = r.invoice_id;

    if (customerName) {
      // Create composite key
      const compositeKey = createCompositeKey(customerName, invoiceId);

      if (!compositeKeyGroups[compositeKey]) {
        compositeKeyGroups[compositeKey] = [];
      }
      compositeKeyGroups[compositeKey].push(r);
    }
  });

  // For each composite key, keep only the latest version
  Object.keys(compositeKeyGroups).forEach((compositeKey) => {
    const records = compositeKeyGroups[compositeKey];
    records.sort((a, b) => {
      if (a.version !== b.version) {
        return (b.version || 0) - (a.version || 0);
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const latestRecord = records[0];
    console.log(`Latest record for ${compositeKey}:`, latestRecord);
    wbMap.set(compositeKey, latestRecord);
  });

  console.log("Created writeback map with keys:", Array.from(wbMap.keys()));
  return wbMap;
}

/**
 * Create a composite key from customer name and invoice ID
 * @param {string} customerName - Customer name
 * @param {string} invoiceId - Invoice ID
 * @returns {string} Composite key
 */
function createCompositeKey(customerName, invoiceId) {
  // Use a delimiter that's unlikely to appear in data
  return `${customerName}::${invoiceId || "NO_INVOICE"}`;
}

/**
 * Extract customer name from a table row
 * @param {Object} row - Table row object
 * @returns {string|null} Customer name or null if not found
 */
function extractCustomerNameFromRow(row) {
  return row[SPECIAL_COLUMNS.CUSTOMER]?.value || null;
}

/**
 * Extract invoice ID from a table row
 * @param {Object} row - Table row object
 * @returns {string|null} Invoice ID or null if not found
 */
function extractInvoiceIdFromRow(row) {
  return row[SPECIAL_COLUMNS.INVOICE_ID]?.value || null;
}

/**
 * Find matching writeback record from the map
 * @param {Map} wbMap - Writeback map
 * @param {string} customerName - Customer name to search for
 * @param {string} invoiceId - Invoice ID to search for
 * @returns {Object|null} Matching writeback record or null
 */
function findWritebackMatch(wbMap, customerName, invoiceId) {
  const compositeKey = createCompositeKey(customerName, invoiceId);
  return wbMap.get(compositeKey) || null;
}

/**
 * Merge a single row with its writeback data
 * @param {Object} row - Original table row
 * @param {Object} wb - Writeback record
 * @param {number} rowIndex - Row index for logging
 * @returns {Object} Merged row
 */
function mergeRowWithWriteback(row, wb, rowIndex) {
  // Create a new row object to avoid mutation
  const updatedRow = { ...row };

  // Update status field if it exists
  if (updatedRow.status && typeof updatedRow.status === "object") {
    updatedRow.status = {
      ...updatedRow.status,
      value: wb.model_feedback || wb.status || "",
    };
    console.log(
      `Row ${rowIndex} - Updated status to: ${updatedRow.status.value}`
    );
  }

  // Update comments field if it exists
  if (updatedRow.comments && typeof updatedRow.comments === "object") {
    updatedRow.comments = {
      ...updatedRow.comments,
      value: wb.comments || "",
    };
    console.log(
      `Row ${rowIndex} - Updated comments to: ${updatedRow.comments.value}`
    );
  }

  return updatedRow;
}

/**
 * Check if merged rows have any writeback data
 * @param {Array} mergedRows - Array of merged table rows
 * @returns {number} Count of rows with writeback data
 */
export function countRowsWithWriteback(mergedRows) {
  return mergedRows.filter(
    (row) =>
      (row.status?.value && row.status.value !== "") ||
      (row.comments?.value && row.comments.value !== "")
  ).length;
}

/**
 * Validate writeback data structure
 * @param {Array} writebackRows - Array of writeback records
 * @returns {Object} Validation result with isValid flag and errors array
 */
export function validateWritebackData(writebackRows) {
  const errors = [];

  if (!Array.isArray(writebackRows)) {
    errors.push("Writeback data is not an array");
    return { isValid: false, errors };
  }

  writebackRows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      errors.push(`Row ${index}: Invalid row object`);
      return;
    }

    // Check for required fields
    const customerName = row.customer_name;
    if (!customerName) {
      errors.push(`Row ${index}: Missing customer_name field`);
    }

    // Invoice ID is now important for unique identification
    const invoiceId = row.invoice_id;
    if (!invoiceId) {
      errors.push(`Row ${index}: Missing invoice_id field`);
    }

    if (
      row.version !== undefined &&
      (typeof row.version !== "number" || row.version < 0)
    ) {
      errors.push(`Row ${index}: Invalid version number`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
