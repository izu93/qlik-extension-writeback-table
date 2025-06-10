// backend/dataService.js
/**
 * Service for reading data from the backend database
 * UPDATED: Customer name based system
 */

import ENV from "../config/env.js";

/**
 * Fetch latest writeback data from the database
 * @param {string} appId - Application identifier
 * @returns {Promise<Array>} Array of writeback records
 */
export async function fetchLatestWritebacks(appId) {
  console.log("DEBUG: Fetching writebacks for app_id:", appId);
  console.log("DEBUG: Current URL:", window.location.href);
  console.log("Fetching latest writebacks for app_id:", appId);

  const webhookUrl = `${ENV.DB_READ_WEBHOOK_URL}?X-Execution-Token=${ENV.DB_READ_TOKEN}&app_id=${appId}`;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ENV.USER_AGENTS.READ,
      },
      body: JSON.stringify({
        app_id: appId,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Fetch writeback response error:",
        response.status,
        errorText
      );
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("Raw DB response data:", data);

    // Handle different response formats from your automation
    let writebackRows = [];

    if (Array.isArray(data)) {
      // Check if it's a nested array
      if (data.length > 0 && Array.isArray(data[0])) {
        // Flatten the nested array
        writebackRows = data[0];
        console.log("Flattened nested array - using data[0]");
      } else {
        writebackRows = data;
        console.log("Using data as direct array");
      }
    } else if (data.DoQuery && Array.isArray(data.DoQuery)) {
      writebackRows = data.DoQuery;
    } else if (data.result && Array.isArray(data.result)) {
      writebackRows = data.result;
    } else if (data.body && Array.isArray(data.body)) {
      writebackRows = data.body;
    } else if (data.data && Array.isArray(data.data)) {
      writebackRows = data.data;
    } else {
      console.warn("Unexpected response format:", data);
      return [];
    }

    console.log("Processed writeback rows:", writebackRows);
    console.log("Number of rows:", writebackRows.length);

    // Additional validation
    if (writebackRows.length > 0) {
      const firstRow = writebackRows[0];
      console.log("First row structure:", firstRow);

      // UPDATED: Check if the first row has the expected customer_name field
      if (!firstRow.customer_name) {
        console.warn(
          "Warning: First row doesn't have customer_name field. Available fields:",
          Object.keys(firstRow)
        );
      }
    }

    return writebackRows;
  } catch (err) {
    console.error("Error fetching latest writebacks:", err);
    return [];
  }
}

/**
 * Fetch specific writeback record by customer name and version
 * @param {string} appId - Application identifier
 * @param {string} customerName - Customer name identifier
 * @param {number} version - Record version (optional, defaults to latest)
 * @returns {Promise<Object|null>} Writeback record or null if not found
 */
export async function fetchWritebackByCustomer(
  appId,
  customerName,
  version = null
) {
  try {
    const allWritebacks = await fetchLatestWritebacks(appId);

    // Filter by customer name
    const customerRecords = allWritebacks.filter((record) => {
      return String(record.customer_name) === String(customerName);
    });

    if (customerRecords.length === 0) {
      return null;
    }

    // If no version specified, return the latest
    if (version === null) {
      return customerRecords.reduce((latest, current) => {
        const latestVersion = latest.version || 0;
        const currentVersion = current.version || 0;
        return currentVersion > latestVersion ? current : latest;
      });
    }

    // Find specific version
    return customerRecords.find((record) => record.version === version) || null;
  } catch (error) {
    console.error("Error fetching writeback by customer:", error);
    return null;
  }
}

/**
 * Get version history for a specific customer
 * @param {string} appId - Application identifier
 * @param {string} customerName - Customer name identifier
 * @returns {Promise<Array>} Array of version records sorted by version descending
 */
export async function getVersionHistory(appId, customerName) {
  try {
    const allWritebacks = await fetchLatestWritebacks(appId);

    // Filter by customer name and sort by version descending
    const customerRecords = allWritebacks
      .filter((record) => {
        return String(record.customer_name) === String(customerName);
      })
      .sort((a, b) => (b.version || 0) - (a.version || 0));

    return customerRecords;
  } catch (error) {
    console.error("Error fetching version history:", error);
    return [];
  }
}

/**
 * Check if customer has any writeback data
 * @param {string} appId - Application identifier
 * @param {string} customerName - Customer name identifier
 * @returns {Promise<boolean>} True if customer has writeback data
 */
export async function hasWritebackData(appId, customerName) {
  try {
    const record = await fetchWritebackByCustomer(appId, customerName);
    return record !== null;
  } catch (error) {
    console.error("Error checking writeback data existence:", error);
    return false;
  }
}

/**
 * Get all customers with writeback data
 * @param {string} appId - Application identifier
 * @returns {Promise<Array>} Array of customer names that have writeback data
 */
export async function getCustomersWithWritebackData(appId) {
  try {
    const allWritebacks = await fetchLatestWritebacks(appId);

    // Get unique customer names
    const customerNames = new Set();
    allWritebacks.forEach((record) => {
      if (record.customer_name) {
        customerNames.add(record.customer_name);
      }
    });

    return Array.from(customerNames);
  } catch (error) {
    console.error("Error fetching customers with writeback data:", error);
    return [];
  }
}

/**
 * Get writeback statistics for an app
 * @param {string} appId - Application identifier
 * @returns {Promise<Object>} Statistics object
 */
export async function getWritebackStatistics(appId) {
  try {
    const allWritebacks = await fetchLatestWritebacks(appId);

    const stats = {
      totalRecords: allWritebacks.length,
      uniqueCustomers: new Set(allWritebacks.map((r) => r.customer_name)).size,
      recordsWithFeedback: allWritebacks.filter(
        (r) => r.model_feedback && r.model_feedback !== ""
      ).length,
      recordsWithComments: allWritebacks.filter(
        (r) => r.comments && r.comments !== ""
      ).length,
      latestUpdate:
        allWritebacks.length > 0
          ? Math.max(
              ...allWritebacks.map((r) =>
                new Date(r.modified_at || r.created_at).getTime()
              )
            )
          : null,
    };

    if (stats.latestUpdate) {
      stats.latestUpdate = new Date(stats.latestUpdate).toISOString();
    }

    return stats;
  } catch (error) {
    console.error("Error fetching writeback statistics:", error);
    return {
      totalRecords: 0,
      uniqueCustomers: 0,
      recordsWithFeedback: 0,
      recordsWithComments: 0,
      latestUpdate: null,
    };
  }
}

/**
 * Validate writeback record structure
 * @param {Object} record - Writeback record to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
export function validateWritebackRecord(record) {
  const errors = [];

  if (!record || typeof record !== "object") {
    errors.push("Invalid record object");
    return { isValid: false, errors };
  }

  // Check required fields
  if (!record.customer_name) {
    errors.push("Missing customer_name field");
  }

  if (!record.app_id) {
    errors.push("Missing app_id field");
  }

  // Check data types
  if (record.version !== undefined && typeof record.version !== "number") {
    errors.push("Version must be a number");
  }

  if (record.amount !== undefined && typeof record.amount !== "number") {
    errors.push("Amount must be a number");
  }

  if (
    record.risk_score !== undefined &&
    typeof record.risk_score !== "number"
  ) {
    errors.push("Risk score must be a number");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
