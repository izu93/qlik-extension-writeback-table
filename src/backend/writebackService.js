// backend/writebackService.js
/**
 * Service for writing data back to the database
 * UPDATED: New field mappings for invoice-based data structure
 */

import ENV from "../config/env.js";
import { getOrPromptUsername, getConsistentAppId } from "../utils/userUtils.js";
import { SPECIAL_COLUMNS } from "../utils/constants.js";

/**
 * Save all changes to the database with version history
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
    const username = await getOrPromptUsername(galaxy);
    console.log("Final username for save operation:", username);

    const saveTimestamp = new Date().toISOString();
    const appId = getConsistentAppId(model);
    console.log("SAVE DEBUG: Using app_id:", appId);
    const sqlStatements = [];

    if (tableData && tableData.rows) {
      const customersWithEdits = getCustomersWithEdits(
        tableData.rows,
        editedData,
        currentPage
      );

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
 */
function findRowDataByCustomerName(rows, customerName, currentPage) {
  return rows.find((row, index) => {
    const currentCustomerName = extractCustomerName(row, index, currentPage);
    return currentCustomerName === customerName;
  });
}

/**
 * Extract customer name from row with fallback
 */
function extractCustomerName(row, rowIndex, currentPage) {
  return (
    row[SPECIAL_COLUMNS.CUSTOMER_NAME]?.value ||
    row[SPECIAL_COLUMNS.CUSTOMER]?.value ||
    `row-${rowIndex}-page-${currentPage}`
  );
}

/**
 * Generate SQL for version history insert
 * UPDATED: Uses your 7 specific columns from Qlik
 */
function generateVersionHistorySQL({
  appId,
  customerName,
  rowData,
  editedData,
  username,
  currentPage,
}) {
  // Extract data from row with your exact field mappings
  const customerNameValue = (
    rowData[SPECIAL_COLUMNS.CUSTOMER]?.value || ""
  ).replace(/'/g, "''");
  const invoiceId = (rowData[SPECIAL_COLUMNS.INVOICE_ID]?.value || "").replace(
    /'/g,
    "''"
  );
  const currentAgingBucket = (
    rowData[SPECIAL_COLUMNS.CURRENT_AGING_BUCKET]?.value || ""
  ).replace(/'/g, "''");
  const predictedPaymentBucket = (
    rowData[SPECIAL_COLUMNS.PREDICTED_PAYMENT_BUCKET]?.value || ""
  ).replace(/'/g, "''");
  const paymentTerms = (
    rowData[SPECIAL_COLUMNS.PAYMENT_TERMS]?.value || ""
  ).replace(/'/g, "''");

  // Handle date field
  const invoiceDueDate = formatDateForSQL(
    rowData[SPECIAL_COLUMNS.INVOICE_DUE_DATE]?.value
  );

  // Handle amount field
  const amount = parseFloat(rowData[SPECIAL_COLUMNS.AMOUNT]?.value) || 0;

  // Get edited values
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

  // Session tracking
  const sessionId =
    window.sessionStorage.getItem("qlik_session_id") ||
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!window.sessionStorage.getItem("qlik_session_id")) {
    window.sessionStorage.setItem("qlik_session_id", sessionId);
  }

  // UPDATED SQL with your 7 columns
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
      app_id, customer_name, invoice_id, current_aging_bucket, 
      predicted_payment_bucket, payment_terms, invoice_due_date, amount,
      model_feedback, comments, created_by, modified_by, 
      created_at, modified_at, version, session_id, 
      edit_started_at, edit_duration_seconds
    )
    SELECT 
      '${appId}',
      '${escapedCustomerName}',
      '${invoiceId}',
      '${currentAgingBucket}',
      '${predictedPaymentBucket}',
      '${paymentTerms}',
      ${invoiceDueDate},
      ${amount},
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
 * Format date value for SQL insertion
 */
function formatDateForSQL(dateValue) {
  if (!dateValue) return "NULL";

  try {
    // Handle various date formats that might come from Qlik
    let date;

    if (typeof dateValue === "string") {
      // Try parsing common date formats
      if (dateValue.includes("/")) {
        // MM/DD/YYYY or DD/MM/YYYY format
        date = new Date(dateValue);
      } else if (dateValue.includes("-")) {
        // YYYY-MM-DD format
        date = new Date(dateValue);
      } else {
        // Try direct parsing
        date = new Date(dateValue);
      }
    } else if (typeof dateValue === "number") {
      // Excel serial date or timestamp
      if (dateValue > 25569) {
        // Excel serial date after 1900-01-01
        date = new Date((dateValue - 25569) * 86400 * 1000);
      } else {
        date = new Date(dateValue);
      }
    } else {
      date = new Date(dateValue);
    }

    if (isNaN(date.getTime())) {
      console.warn(`Invalid date value: ${dateValue}`);
      return "NULL";
    }

    // Format as YYYY-MM-DD for PostgreSQL
    const formattedDate = date.toISOString().split("T")[0];
    return `'${formattedDate}'`;
  } catch (error) {
    console.warn(`Error formatting date ${dateValue}:`, error);
    return "NULL";
  }
}

/**
 * Execute SQL statements against the database
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

    // Add delay between requests
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
