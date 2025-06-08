// backend/mergeService.js
/**
 * Service for merging Qlik table data with writeback database data
 */

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

  // Create a map for faster lookups - using the latest version for each account
  const wbMap = createWritebackMap(writebackRows);

  // Merge the data
  const mergedRows = tableRows.map((row, rowIndex) => {
    // Try to get account ID from different possible fields
    const accountId = extractAccountIdFromRow(row);

    console.log(
      `Row ${rowIndex} - Account ID: ${accountId} (${typeof accountId})`
    );

    if (!accountId) {
      console.log(`Row ${rowIndex} - No account ID found, skipping merge`);
      return row;
    }

    // Try to find matching writeback data
    const wb = findWritebackMatch(wbMap, accountId);

    if (wb) {
      console.log(`Row ${rowIndex} - Found matching writeback:`, wb);
      return mergeRowWithWriteback(row, wb, rowIndex);
    } else {
      console.log(
        `Row ${rowIndex} - No matching writeback found for account: ${accountId}`
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
 * @returns {Map} Map with account IDs as keys and latest records as values
 */
function createWritebackMap(writebackRows) {
  const wbMap = new Map();

  // First, group by account_id and find the latest version for each account
  const accountGroups = {};

  writebackRows.forEach((r, index) => {
    console.log(`Processing writeback row ${index}:`, r);

    const accountId = r.account_id || r.accountId || r.AccountID || r.id;
    if (accountId) {
      if (!accountGroups[accountId]) {
        accountGroups[accountId] = [];
      }
      accountGroups[accountId].push(r);
    }
  });

  // For each account, keep only the latest version
  Object.keys(accountGroups).forEach((accountId) => {
    const records = accountGroups[accountId];

    // Sort by version descending, then by created_at descending
    records.sort((a, b) => {
      if (a.version !== b.version) {
        return (b.version || 0) - (a.version || 0);
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    const latestRecord = records[0];
    console.log(`Latest record for account ${accountId}:`, latestRecord);

    // Store only string version - NEVER add NaN to the map
    wbMap.set(String(accountId), latestRecord);

    // Only add number version if it's actually a valid number
    const numericId = Number(accountId);
    if (!isNaN(numericId)) {
      wbMap.set(numericId, latestRecord);
      console.log(`Also mapped numeric version: ${numericId}`);
    } else {
      console.log(`Skipped numeric mapping for non-numeric ID: ${accountId}`);
    }
  });

  console.log("Created writeback map with keys:", Array.from(wbMap.keys()));
  return wbMap;
}

/**
 * Extract account ID from a table row
 * @param {Object} row - Table row object
 * @returns {string|null} Account ID or null if not found
 */
function extractAccountIdFromRow(row) {
  if (row.AccountID?.value) {
    return row.AccountID.value;
  } else if (row.accountId?.value) {
    return row.accountId.value;
  } else if (row.account_id?.value) {
    return row.account_id.value;
  }
  return null;
}

/**
 * Find matching writeback record from the map
 * @param {Map} wbMap - Writeback map
 * @param {string} accountId - Account ID to search for
 * @returns {Object|null} Matching writeback record or null
 */
function findWritebackMatch(wbMap, accountId) {
  // Try to find matching writeback data - check string first, then number only if valid
  let wb = wbMap.get(String(accountId));

  if (!wb) {
    const numericId = Number(accountId);
    if (!isNaN(numericId)) {
      wb = wbMap.get(numericId);
    }
  }

  return wb || null;
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

    const accountId =
      row.account_id || row.accountId || row.AccountID || row.id;
    if (!accountId) {
      errors.push(`Row ${index}: Missing account ID field`);
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
