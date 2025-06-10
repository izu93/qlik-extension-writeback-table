// backend/writebackService.js
/**
 * Service for writing data back to the database
 * UPDATED: Field mappings for new data structure
 */

import ENV from "../config/env.js";
import { getOrPromptUsername, getConsistentAppId } from "../utils/userUtils.js";
import { SPECIAL_COLUMNS } from "../utils/constants.js";

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
      // First, get the customers that have edits
      const customersWithEdits = getCustomersWithEdits(
        tableData.rows,
        editedData,
        currentPage
      );

      // For each customer with edits, generate SQL
      for (const customerName of customersWithEdits) {
        try {
          const rowData = findRowDataByCustomerName(
            tableData.rows,
            customerName,
            currentPage
          );
          if (!rowData) continue;

          const sql = generateVersionHistorySQL({
            appId,
            customerName,
            rowData,
            editedData,
            username,
            currentPage,
          });

          sqlStatements.push(sql);
          console.log(`Generated version history SQL for ${customerName}`);
        } catch (error) {
          console.error(`Error processing customer ${customerName}:`, error);
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
 * Get customers that have edits
 * @param {Array} rows - Table rows
 * @param {Object} editedData - Edited data object
 * @param {number} currentPage - Current page number
 * @returns {Set} Set of customer names with edits
 */
function getCustomersWithEdits(rows, editedData, currentPage) {
  const customersWithEdits = new Set();

  rows.forEach((row, rowIndex) => {
    const customerName = extractCustomerName(row, rowIndex, currentPage);
    const statusKey = `${customerName}-status`;
    const commentsKey = `${customerName}-comments`;

    const hasEdits =
      editedData[statusKey] !== undefined ||
      editedData[commentsKey] !== undefined;

    if (hasEdits) {
      customersWithEdits.add(customerName);
    }
  });

  return customersWithEdits;
}

/**
 * Find row data by customer name
 * @param {Array} rows - Table rows
 * @param {string} customerName - Customer name to find
 * @param {number} currentPage - Current page number
 * @returns {Object|null} Row data or null if not found
 */
function findRowDataByCustomerName(rows, customerName, currentPage) {
  return rows.find((row, index) => {
    const currentCustomerName = extractCustomerName(row, index, currentPage);
    return currentCustomerName === customerName;
  });
}

/**
 * Extract customer name from row with fallback
 * @param {Object} row - Table row
 * @param {number} rowIndex - Row index
 * @param {number} currentPage - Current page
 * @returns {string} Customer name
 */
function extractCustomerName(row, rowIndex, currentPage) {
  return (
    row[SPECIAL_COLUMNS.CUSTOMER]?.value ||
    `row-${rowIndex}-page-${currentPage}`
  );
}

/**
 * Generate SQL for version history insert
 * UPDATED: Uses customer_name as unique identifier instead of account_id
 * @param {Object} params - Parameters for SQL generation
 * @returns {string} SQL statement
 */
function generateVersionHistorySQL({
  appId,
  customerName,
  rowData,
  editedData,
  username,
  currentPage,
}) {
  // UPDATED: Extract data from row with new field mappings
  const amount = parseFloat(rowData.Amount?.value) || 0;
  const agingBucket = (rowData["Aging buckets"]?.value || "").replace(
    /'/g,
    "''"
  );
  const daysPastDue = parseInt(rowData["Days Past Due"]?.value) || 0;
  const riskScore = parseFloat(rowData.Risk?.value?.replace("%", "")) || 0;

  // LEGACY: Keep for backward compatibility
  const probabilityOfChurn = 0; // No longer used

  // Get edited values - use customerName as the key
  const statusKey = `${customerName}-status`;
  const commentsKey = `${customerName}-comments`;
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
  const escapedCustomerName = customerName.replace(/'/g, "''");

  // Session tracking (existing code)
  const sessionId =
    window.sessionStorage.getItem("qlik_session_id") ||
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!window.sessionStorage.getItem("qlik_session_id")) {
    window.sessionStorage.setItem("qlik_session_id", sessionId);
  }

  // UPDATED SQL - removed account_id, using customer_name as unique identifier
  const sql = `
    WITH version_info AS (
      SELECT 
        COALESCE(MAX(version), 0) + 1 as next_version,
        COALESCE(MIN(created_at), CURRENT_TIMESTAMP) as original_created_at,
        COALESCE(
          (SELECT created_by FROM writeback_data 
           WHERE app_id = '${appId}' AND customer_name = '${escapedCustomerName}' 
           ORDER BY version ASC LIMIT 1), 
          '${escapedUsername}'
        ) as original_created_by
      FROM writeback_data 
      WHERE app_id = '${appId}' AND customer_name = '${escapedCustomerName}'
    )
    INSERT INTO writeback_data (
      app_id, customer_name, amount, aging_bucket,
      days_past_due, risk_score, probability_of_churn,
      model_feedback, comments, created_by, modified_by, created_at, modified_at, version,
      session_id, edit_started_at, edit_duration_seconds
    )
    SELECT 
      '${appId}',
      '${escapedCustomerName}',
      ${amount},
      '${agingBucket}',
      ${daysPastDue},
      ${riskScore},
      ${probabilityOfChurn},
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
    const payload = {
      query: sqlStatements[i],
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
          "Content-Type": "application/json",
          "User-Agent": ENV.USER_AGENTS.WRITE,
        },
        body: JSON.stringify(payload),
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
