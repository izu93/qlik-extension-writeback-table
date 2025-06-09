// backend/writebackService.js
/**
 * Service for writing data back to the database
 */

import ENV from "../config/env.js";
import { getOrPromptUsername, getConsistentAppId } from "../utils/userUtils.js";

/**
 * Save all changes to the database with version history
 * @param {Object} params - Parameters object
 * @param {Object} params.editedData - Object containing edited field values
 * @param {Object} params.tableData - Current table data
 * @param {number} params.currentPage - Current page number
 * @param {Object} params.model - Qlik model object
 * @param {Object} params.galaxy - Galaxy object for username detection
 * @returns {Promise<Object>} Result object with success status and details
 */
export async function saveAllChanges({
  editedData,
  tableData,
  currentPage,
  model,
  galaxy,
}) {
  console.log("Saving all changes to PostgreSQL database:", editedData);

  try {
    // Get username
    const username = await getOrPromptUsername(galaxy);
    console.log("Final username for save operation:", username);

    const saveTimestamp = new Date().toISOString();
    const appId = getConsistentAppId(model);
    console.log("SAVE DEBUG: Using app_id:", appId);
    const sqlStatements = [];

    if (tableData && tableData.rows) {
      // First, get the accounts that have edits
      const accountsWithEdits = getAccountsWithEdits(
        tableData.rows,
        editedData,
        currentPage
      );

      // For each account with edits, generate SQL
      for (const accountId of accountsWithEdits) {
        try {
          const rowData = findRowDataByAccountId(
            tableData.rows,
            accountId,
            currentPage
          );
          if (!rowData) continue;

          const sql = generateVersionHistorySQL({
            appId,
            accountId,
            rowData,
            editedData,
            username,
            currentPage,
          });

          sqlStatements.push(sql);
          console.log(`Generated version history SQL for ${accountId}`);
        } catch (error) {
          console.error(`Error processing account ${accountId}:`, error);
        }
      }
    }

    if (sqlStatements.length === 0) {
      return {
        success: false,
        message: "No changes to save",
        type: "warning",
      };
    }

    console.log(
      `Generated ${sqlStatements.length} SQL statements for database`
    );

    // Execute SQL statements - PASS appId here
    const result = await executeSQLStatements(sqlStatements, appId);

    return result;
  } catch (error) {
    console.error("Error saving to database:", error);
    return {
      success: false,
      message: `Error saving changes: ${error.message}`,
      type: "error",
    };
  }
}

/**
 * Get accounts that have edits
 * @param {Array} rows - Table rows
 * @param {Object} editedData - Edited data object
 * @param {number} currentPage - Current page number
 * @returns {Set} Set of account IDs with edits
 */
function getAccountsWithEdits(rows, editedData, currentPage) {
  const accountsWithEdits = new Set();

  rows.forEach((row, rowIndex) => {
    const accountId = extractAccountId(row, rowIndex, currentPage);
    const statusKey = `${accountId}-status`;
    const commentsKey = `${accountId}-comments`;

    const hasEdits =
      editedData[statusKey] !== undefined ||
      editedData[commentsKey] !== undefined;

    if (hasEdits) {
      accountsWithEdits.add(accountId);
    }
  });

  return accountsWithEdits;
}

/**
 * Find row data by account ID
 * @param {Array} rows - Table rows
 * @param {string} accountId - Account ID to find
 * @param {number} currentPage - Current page number
 * @returns {Object|null} Row data or null if not found
 */
function findRowDataByAccountId(rows, accountId, currentPage) {
  return rows.find((row, index) => {
    const currentAccountId = extractAccountId(row, index, currentPage);
    return currentAccountId === accountId;
  });
}

/**
 * Extract account ID from row with fallback
 * @param {Object} row - Table row
 * @param {number} rowIndex - Row index
 * @param {number} currentPage - Current page
 * @returns {string} Account ID
 */
function extractAccountId(row, rowIndex, currentPage) {
  return row.AccountID?.value || `row-${rowIndex}-page-${currentPage}`;
}

/**
 * Generate SQL for version history insert
 * @param {Object} params - Parameters for SQL generation
 * @returns {string} SQL statement
 */
//new  generateVersionHistorySQL function:
function generateVersionHistorySQL({
  appId,
  accountId,
  rowData,
  editedData,
  username,
  currentPage,
}) {
  // Extract data from row (existing code stays the same)
  const baseFee = parseFloat(rowData.BaseFee?.value) || 0;
  const planType = (rowData.PlanType?.value || "").replace(/'/g, "''");
  const promotion = (rowData.Promotion?.value || "").replace(/'/g, "''");
  const serviceTickets = parseInt(rowData.ServiceTickets?.value) || 0;
  const serviceRating = parseFloat(rowData.ServiceRating?.value) || 0;
  const probabilityOfChurn =
    parseFloat(rowData["Probability of Churn"]?.value?.replace("%", "")) || 0;
  const shapValue = parseFloat(rowData["SHAP Value"]?.value) || 0;

  // Get edited values (existing code stays the same)
  const statusKey = `${accountId}-status`;
  const commentsKey = `${accountId}-comments`;
  const modelFeedback = (
    editedData[statusKey] ||
    rowData.status?.value ||
    ""
  ).replace(/'/g, "''");
  const comments = (
    editedData[commentsKey] ||
    rowData.comments?.value ||
    ""
  ).replace(/'/g, "''");

  const escapedUsername = (username || "system_user").replace(/'/g, "''");

  // NEW: Add session tracking
  const sessionId =
    window.sessionStorage.getItem("qlik_session_id") ||
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Store session ID for this session
  if (!window.sessionStorage.getItem("qlik_session_id")) {
    window.sessionStorage.setItem("qlik_session_id", sessionId);
  }

  // UPDATED SQL with new tracking fields
  const sql = `
    WITH version_info AS (
      SELECT 
        COALESCE(MAX(version), 0) + 1 as next_version,
        COALESCE(MIN(created_at), CURRENT_TIMESTAMP) as original_created_at,
        COALESCE(
          (SELECT created_by FROM writeback_data 
           WHERE app_id = '${appId}' AND account_id = '${accountId}' 
           ORDER BY version ASC LIMIT 1), 
          '${escapedUsername}'
        ) as original_created_by
      FROM writeback_data 
      WHERE app_id = '${appId}' AND account_id = '${accountId}'
    )
    INSERT INTO writeback_data (
      app_id, account_id, base_fee, plan_type, promotion,
      service_tickets, service_rating, probability_of_churn, shap_value,
      model_feedback, comments, created_by, modified_by, created_at, modified_at, version,
      session_id, edit_started_at, edit_duration_seconds
    )
    SELECT 
      '${appId}',
      '${accountId}',
      ${baseFee},
      '${planType}',
      '${promotion}',
      ${serviceTickets},
      ${serviceRating},
      ${probabilityOfChurn},
      ${shapValue},
      '${modelFeedback}',
      '${comments}',
      CASE WHEN next_version = 1 THEN '${escapedUsername}' ELSE original_created_by END,
      '${escapedUsername}',
      CASE WHEN next_version = 1 THEN CURRENT_TIMESTAMP ELSE original_created_at END,
      CURRENT_TIMESTAMP,
      next_version,
      '${sessionId}',
      CURRENT_TIMESTAMP - INTERVAL '30 seconds',
      30
    FROM version_info;`;

  return sql;
}
/**
 * Execute SQL statements against the database
 * @param {Array} sqlStatements - Array of SQL statements
 * @param {string} appId - Application ID to include in payload
 * @returns {Promise<Object>} Execution result
 */
async function executeSQLStatements(sqlStatements, appId) {
  let successCount = 0;
  const errors = [];
  const fullWebhookUrl = `${ENV.DB_SAVE_WEBHOOK_URL}?X-Execution-Token=${ENV.DB_SAVE_TOKEN}`;

  for (let i = 0; i < sqlStatements.length; i++) {
    // FIXED: Create proper payload object
    const payload = {
      query: sqlStatements[i], // Changed from 'sql' to 'query'
      app_id: appId,
    };

    try {
      console.log(
        `Sending SQL statement ${i + 1}/${sqlStatements.length} to automation`
      );
      console.log(
        "DEBUG: Payload being sent:",
        JSON.stringify(payload, null, 2)
      );

      const response = await fetch(fullWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // CHANGED: from text/plain to application/json
          "User-Agent": ENV.USER_AGENTS.WRITE,
        },
        body: JSON.stringify(payload), // CHANGED: stringify the payload object
      });

      if (response.ok) {
        const result = await response.text();
        successCount++;
        console.log(`SQL statement ${i + 1} executed successfully:`, result);
      } else {
        const errorText = await response.text();
        console.error(
          `SQL statement ${i + 1} failed:`,
          response.status,
          errorText
        );
        errors.push(`Statement ${i + 1}: ${errorText}`);
      }
    } catch (error) {
      console.error(`Error with SQL statement ${i + 1}:`, error);
      errors.push(`Statement ${i + 1}: ${error.message}`);
    }

    // Add delay between requests to avoid overwhelming the server
    if (i < sqlStatements.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Return result summary
  if (errors.length === 0) {
    console.log("All SQL statements executed successfully");
    return {
      success: true,
      message: `Successfully saved ${successCount} records to database`,
      type: "success",
      successCount,
      totalCount: sqlStatements.length,
    };
  } else {
    console.error("Some SQL statements failed:", errors);
    return {
      success: false,
      message: `Saved ${successCount}/${sqlStatements.length} records. ${errors.length} failed.`,
      type: errors.length === sqlStatements.length ? "error" : "warning",
      successCount,
      totalCount: sqlStatements.length,
      errors,
    };
  }
}
