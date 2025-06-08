// backend/dataService.js
/**
 * Service for reading data from the backend database
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

      // Check if the first row has the expected account_id field
      if (!firstRow.account_id && !firstRow.accountId && !firstRow.AccountID) {
        console.warn(
          "Warning: First row doesn't have account_id field. Available fields:",
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
 * Fetch specific writeback record by account ID and version
 * @param {string} appId - Application identifier
 * @param {string} accountId - Account identifier
 * @param {number} version - Record version (optional, defaults to latest)
 * @returns {Promise<Object|null>} Writeback record or null if not found
 */
export async function fetchWritebackByAccount(
  appId,
  accountId,
  version = null
) {
  try {
    const allWritebacks = await fetchLatestWritebacks(appId);

    // Filter by account ID
    const accountRecords = allWritebacks.filter((record) => {
      const recordAccountId =
        record.account_id || record.accountId || record.AccountID;
      return String(recordAccountId) === String(accountId);
    });

    if (accountRecords.length === 0) {
      return null;
    }

    // If no version specified, return the latest
    if (version === null) {
      return accountRecords.reduce((latest, current) => {
        const latestVersion = latest.version || 0;
        const currentVersion = current.version || 0;
        return currentVersion > latestVersion ? current : latest;
      });
    }

    // Find specific version
    return accountRecords.find((record) => record.version === version) || null;
  } catch (error) {
    console.error("Error fetching writeback by account:", error);
    return null;
  }
}

/**
 * Get version history for a specific account
 * @param {string} appId - Application identifier
 * @param {string} accountId - Account identifier
 * @returns {Promise<Array>} Array of version records sorted by version descending
 */
export async function getVersionHistory(appId, accountId) {
  try {
    const allWritebacks = await fetchLatestWritebacks(appId);

    // Filter by account ID and sort by version descending
    const accountRecords = allWritebacks
      .filter((record) => {
        const recordAccountId =
          record.account_id || record.accountId || record.AccountID;
        return String(recordAccountId) === String(accountId);
      })
      .sort((a, b) => (b.version || 0) - (a.version || 0));

    return accountRecords;
  } catch (error) {
    console.error("Error fetching version history:", error);
    return [];
  }
}

/**
 * Check if account has any writeback data
 * @param {string} appId - Application identifier
 * @param {string} accountId - Account identifier
 * @returns {Promise<boolean>} True if account has writeback data
 */
export async function hasWritebackData(appId, accountId) {
  try {
    const record = await fetchWritebackByAccount(appId, accountId);
    return record !== null;
  } catch (error) {
    console.error("Error checking writeback data existence:", error);
    return false;
  }
}
