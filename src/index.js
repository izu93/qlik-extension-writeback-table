import {
  useElement,
  useLayout,
  useEffect,
  useState,
  useModel,
  useSelections,
  useConstraints,
} from "@nebula.js/stardust";
import properties from "./object-properties";
import data from "./data";
import ext from "./ext";
import ENV from "./env";

/**
 * Utility function to process Qlik hypercube data and transform it for the table
 * Takes the layout object from useLayout hook and extracts dimensions, measures,
 * and adds writeback columns
 */
function processData({ layout, pageData }) {
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
        (layout.customLabels &&
          layout.customLabels.dimensions &&
          layout.customLabels.dimensions[dimIndex]) ||
        dim.qLabel ||
        dim.qLabelExpression ||
        dim.qFallbackTitle,
      type: "dimension",
      meta: {
        description: dim.qDesc,
        fieldName: dim.qGroupFieldDefs && dim.qGroupFieldDefs[0],
        isCustomLabel: !!(
          layout.customLabels &&
          layout.customLabels.dimensions &&
          layout.customLabels.dimensions[dimIndex]
        ),
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
        (layout.customLabels &&
          layout.customLabels.measures &&
          layout.customLabels.measures[measIndex]) ||
        meas.qLabel ||
        meas.qLabelExpression ||
        meas.qFallbackTitle,
      type: "measure",
      meta: {
        description: meas.qDesc,
        expression: meas.qDef,
        isCustomLabel: !!(
          layout.customLabels &&
          layout.customLabels.measures &&
          layout.customLabels.measures[measIndex]
        ),
        sortDirection: "",
      },
    })),
  ];

  // Add writeback columns if enabled
  if (layout.tableOptions?.allowWriteback) {
    headers.push(
      {
        id: "status",
        label: layout.columnLabels?.status || "Status",
        type: "writeback",
      },
      {
        id: "comments",
        label: layout.columnLabels?.comments || "Comments",
        type: "writeback",
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
      formattedRow.status = {
        value: "",
        editable: true,
      };
      formattedRow.comments = {
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

// --- UPDATED: Improved fetchLatestWritebacks function ---
async function fetchLatestWritebacks(appId) {
  console.log("Fetching latest writebacks for app_id:", appId);

  const webhookUrl = `${ENV.DB_READ_WEBHOOK_URL}?X-Execution-Token=${ENV.DB_READ_TOKEN}`;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Qlik-Writeback-Extension-Read",
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
      // Check if it's a nested array (your case)
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

    // Additional validation - make sure we have objects with the right structure
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
// --- UPDATED: Improved mergeWritebackData function ---
function mergeWritebackData(tableRows, writebackRows) {
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

  // Merge the data
  const mergedRows = tableRows.map((row, rowIndex) => {
    // Try to get account ID from different possible fields
    let accountId = null;

    if (row.AccountID?.value) {
      accountId = row.AccountID.value;
    } else if (row.accountId?.value) {
      accountId = row.accountId.value;
    } else if (row.account_id?.value) {
      accountId = row.account_id.value;
    }

    console.log(
      `Row ${rowIndex} - Account ID: ${accountId} (${typeof accountId})`
    );

    if (!accountId) {
      console.log(`Row ${rowIndex} - No account ID found, skipping merge`);
      return row;
    }

    // Try to find matching writeback data - check string first, then number only if valid
    let wb = wbMap.get(String(accountId));

    if (!wb) {
      const numericId = Number(accountId);
      if (!isNaN(numericId)) {
        wb = wbMap.get(numericId);
      }
    }

    if (wb) {
      console.log(`Row ${rowIndex} - Found matching writeback:`, wb);

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

const getConsistentAppId = (model) => {
  // Try to get app ID from URL first (most reliable)
  const urlParams = new URLSearchParams(window.location.search);
  const appIdFromUrl = urlParams.get("app") || urlParams.get("appid");

  if (appIdFromUrl) {
    return `qlik_app_${appIdFromUrl}`;
  }

  // Fallback to model ID if URL doesn't have it
  const modelId = model?.id || "default";
  return `qlik_app_${modelId}`;
};
/**
 * Main extension entry point - the supernova function
 */
export default function supernova(galaxy) {
  console.log(
    "index.js: Initializing writeback-table extension with galaxy",
    galaxy
  );

  return {
    // Define the extension's data requirements and properties
    qae: {
      properties,
      data,
    },
    ext: ext(galaxy),

    /**
     * Component function that renders the visualization
     */
    component() {
      console.log("index.js: Component function called");

      // Get the DOM element where we'll render the table
      const element = useElement();
      console.log("index.js: Got element", element);

      // Get the layout data from Qlik
      const layout = useLayout();
      console.log("index.js: Got layout", layout);

      // Get the model for Qlik interactions
      const model = useModel();
      console.log("index.js: Got model", model);

      // Get selections for selection functionality
      const selections = useSelections();
      console.log("index.js: Got selections", selections);

      // Get constraints for responsive design
      const constraints = useConstraints();

      // State for the processed table data
      const [tableData, setTableData] = useState(null);
      // State to track user edits in writeback cells
      const [editedData, setEditedData] = useState({});
      // State to track selected row
      const [selectedRow, setSelectedRow] = useState(null);

      // Pagination state
      const [currentPage, setCurrentPage] = useState(1);
      const [totalRows, setTotalRows] = useState(0);
      const [isLoading, setIsLoading] = useState(false);
      const [paginationInfo, setPaginationInfo] = useState({
        pageSize: 100,
        totalPages: 1,
        currentPageFirstRow: 1,
        currentPageLastRow: 100,
      });

      // Get initial data when layout changes
      const [lastLayoutId, setLastLayoutId] = useState("");

      //Add a new state variable for tracking selection mode
      const [wasInSelectionMode, setWasInSelectionMode] = useState(false);

      // State to track if there are unsaved changes
      const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

      // State to track if a save operation is in progress
      // This prevents multiple clicks on the save button
      const [isSaving, setIsSaving] = useState(false);

      // Get the default page size from properties or use 100
      const getPageSize = () => {
        return (
          (layout.paginationOptions && layout.paginationOptions.pageSize) ||
          (layout.tableOptions && layout.tableOptions.pageSize) ||
          100
        );
      };

      // Calculate total pages
      const calculatePaginationInfo = (
        totalRowCount,
        pageSize,
        currentPageNum
      ) => {
        const totalPages = Math.max(1, Math.ceil(totalRowCount / pageSize));
        const firstRow = Math.min(
          (currentPageNum - 1) * pageSize + 1,
          totalRowCount
        );
        const lastRow = Math.min(currentPageNum * pageSize, totalRowCount);

        return {
          pageSize,
          totalPages,
          currentPageFirstRow: firstRow,
          currentPageLastRow: lastRow,
        };
      };

      // Fetch data for a specific page
      const fetchPageData = async (page) => {
        try {
          setIsLoading(true);
          const pageSize = getPageSize();
          const qHeight = pageSize;
          const qTop = (page - 1) * pageSize;

          console.log(
            `Fetching page ${page} data: top=${qTop}, height=${qHeight}`
          );

          // Request data for the current page
          const dataPages = await model.getHyperCubeData("/qHyperCubeDef", [
            {
              qTop: qTop,
              qLeft: 0,
              qWidth: 10, // Match the width from object-properties
              qHeight: qHeight,
            },
          ]);

          console.log(`Received data for page ${page}:`, dataPages[0]);
          setIsLoading(false);
          return dataPages[0].qMatrix;
        } catch (error) {
          console.error("Error fetching page data:", error);
          setIsLoading(false);
          return [];
        }
      };
      // Add a new state variable to track user-initiated page changes

      const [userChangedPage, setUserChangedPage] = useState(false);

      // Handle page change
      const changePage = async (newPage) => {
        try {
          console.log(
            `Changing to page ${newPage} (current: ${currentPage}, total: ${paginationInfo.totalPages})`
          );

          if (newPage < 1 || newPage > paginationInfo.totalPages) {
            console.log(`Invalid page number ${newPage}`);
            return; // Don't process invalid pages
          }

          // Set flag BEFORE anything else
          setUserChangedPage(true);

          // Delay resetting the user changed page flag - INCREASED to 2000ms (2 seconds)
          // This gives enough time for all layout updates to complete
          const resetTimer = setTimeout(() => {
            setUserChangedPage(false);
            console.log("Resetting userChangedPage flag");
          }, 2000);

          // Store the current timer so we can clear it if needed
          window.resetPageFlagTimer = resetTimer;

          console.log("Starting page change, userChangedPage =", true);

          // Set page before fetching data to avoid visual jumps
          setCurrentPage(newPage);

          // Fetch data for the new page
          const pageData = await fetchPageData(newPage);

          console.log(
            `Processing data for page ${newPage}, got ${pageData.length} rows`
          );

          // Process the new data
          const formattedData = processData({ layout, pageData });
          setTableData(formattedData);

          // Update pagination display
          const pageSize = getPageSize();
          const newPaginationInfo = calculatePaginationInfo(
            totalRows,
            pageSize,
            newPage
          );
          setPaginationInfo(newPaginationInfo);

          // Reset edited data for the new page
          //setEditedData({});
          setSelectedRow(null);

          console.log(
            `Page change complete. Now on page ${newPage} of ${newPaginationInfo.totalPages}`
          );
        } catch (error) {
          console.error("Error changing page:", error);
          setUserChangedPage(false);
          if (window.resetPageFlagTimer) {
            clearTimeout(window.resetPageFlagTimer);
          }
        }
      };

      // Streamlined getCurrentUsername - only the methods that actually work
      const getCurrentUsername = async () => {
        console.log("Starting username retrieval...");

        try {
          // Method 1: For Qlik Cloud - Extract tenant from URL (WORKS!)
          const hostname = window.location.hostname;
          console.log("DEBUG: Current hostname:", hostname);

          if (
            hostname.includes(".qlikcloud.com") ||
            hostname.includes(".qliksense.com")
          ) {
            const parts = hostname.split(".");
            if (parts.length >= 3) {
              const tenantName = parts[0];
              console.log("Extracted tenant name from URL:", tenantName);
              return tenantName;
            }
          }

          // Method 2: For localhost - try Qlik methods
          if (
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1"
          ) {
            console.log("DEBUG: Running in localhost environment");

            // Try qlik.getGlobal() for localhost
            if (window.qlik && window.qlik.getGlobal) {
              try {
                const global = await window.qlik.getGlobal();
                if (global && global.getAuthenticatedUser) {
                  const user = await global.getAuthenticatedUser();
                  if (user && (user.qName || user.userId || user.name)) {
                    const username = user.qName || user.userId || user.name;
                    console.log(
                      "Got username from qlik.getGlobal():",
                      username
                    );
                    return username;
                  }
                }
              } catch (globalError) {
                console.log("DEBUG: qlik.getGlobal() failed:", globalError);
              }
            }

            // Check galaxy for localhost
            if (typeof galaxy !== "undefined" && galaxy) {
              const galaxyUserPaths = [
                () => galaxy.session?.config?.user,
                () => galaxy.session?.user,
                () => galaxy.user,
                () => galaxy.sense?.user,
                () => galaxy.hostConfig?.user,
              ];

              for (const getUser of galaxyUserPaths) {
                try {
                  const userInfo = getUser();
                  if (userInfo) {
                    const username =
                      typeof userInfo === "string"
                        ? userInfo
                        : userInfo.name ||
                          userInfo.email ||
                          userInfo.userId ||
                          userInfo.user;

                    if (username && typeof username === "string") {
                      console.log("Got username from galaxy:", username);
                      return username;
                    }
                  }
                } catch (pathError) {
                  // Silent fail, try next path
                }
              }
            }
          }

          // Method 3: Fallback username generation
          if (hostname.includes(".qlikcloud.com")) {
            const fallbackUser = `qlik_cloud_user_${Date.now()
              .toString()
              .slice(-6)}`;
            console.log("Using Qlik Cloud fallback:", fallbackUser);
            return fallbackUser;
          } else {
            const fallbackUser = `qlik_user_${Date.now().toString().slice(-6)}`;
            console.log("Using fallback username:", fallbackUser);
            return fallbackUser;
          }
        } catch (error) {
          console.error("Error in getCurrentUsername:", error);
          return `error_user_${Date.now()}`;
        }
      };

      // Simplified username retrieval - no prompts, just auto-detection
      const getOrPromptUsername = async () => {
        // Check if we already have a stored username
        let storedUsername = localStorage.getItem("writeback_username");

        if (!storedUsername) {
          // Try automatic detection
          storedUsername = await getCurrentUsername();

          // Store the detected username
          localStorage.setItem("writeback_username", storedUsername);
          console.log("Stored username:", storedUsername);
        } else {
          console.log("Using cached username:", storedUsername);
        }

        return storedUsername;
      };

      // Modified saveAllChanges for version history tracking
      const saveAllChanges = async () => {
        if (isSaving) {
          console.log("Save already in progress, ignoring click");
          return;
        }
        console.log("Saving all changes to PostgreSQL database:", editedData);

        // Set saving state immediately
        setIsSaving(true);

        const saveButtons = document.querySelectorAll(".save-all-button");
        saveButtons.forEach((btn) => {
          btn.disabled = true;
          btn.classList.add("saving");
          btn.textContent = "Saving...";
        });

        try {
          const processingIndicator = document.createElement("div");
          processingIndicator.className = "save-message processing";
          processingIndicator.innerHTML = `
      <div>Saving to database...</div>
      <div style="font-size: 0.9em; margin-top: 5px;">Real-time sync enabled</div>
    `;
          document
            .querySelector(".writeback-table-container")
            .appendChild(processingIndicator);

          // Get username
          let username = await getOrPromptUsername();
          console.log("Final username for save operation:", username);

          const saveTimestamp = new Date().toISOString();
          //const appId = "qlik_app_" + (model?.id || "default"); // Consistent app_id
          // NEW CODE - Get consistent app_id from URL:
          const appId = getConsistentAppId(model); // Use the new function
          const sqlStatements = [];

          if (tableData && tableData.rows) {
            // First, get the latest version for each account that has edits
            const accountsWithEdits = new Set();
            tableData.rows.forEach((row, rowIndex) => {
              const accountId = row.AccountID
                ? row.AccountID.value
                : `row-${rowIndex}-page-${currentPage}`;

              const statusKey = `${accountId}-status`;
              const commentsKey = `${accountId}-comments`;
              const hasEdits =
                editedData[statusKey] !== undefined ||
                editedData[commentsKey] !== undefined;

              if (hasEdits) {
                accountsWithEdits.add(accountId);
              }
            });

            // For each account with edits, determine if it's a new record or an update
            for (const accountId of accountsWithEdits) {
              try {
                // Check if this account already exists in the database
                console.log(
                  `Checking existing versions for account: ${accountId}`
                );

                // Get the latest version for this account
                const versionCheckSql = `
            SELECT COALESCE(MAX(version), 0) as latest_version,
                   MIN(created_at) as original_created_at,
                   (SELECT created_by FROM writeback_data 
                    WHERE app_id = '${appId}' AND account_id = '${accountId}' 
                    ORDER BY version ASC LIMIT 1) as original_created_by
            FROM writeback_data 
            WHERE app_id = '${appId}' AND account_id = '${accountId}'`;

                console.log(`Version check SQL: ${versionCheckSql}`);

                // For now, we'll assume this is handled by your backend
                // In a real implementation, you'd need to query the database first
                // For this demo, we'll use a simple logic based on existence

                // Find the row data for this account
                const rowData = tableData.rows.find((row) => {
                  const currentAccountId = row.AccountID
                    ? row.AccountID.value
                    : `row-${tableData.rows.indexOf(row)}-page-${currentPage}`;
                  return currentAccountId === accountId;
                });

                if (!rowData) continue;

                const statusKey = `${accountId}-status`;
                const commentsKey = `${accountId}-comments`;

                // Build the record data
                const baseFee = parseFloat(rowData.BaseFee?.value) || 0;
                const planType = (rowData.PlanType?.value || "").replace(
                  /'/g,
                  "''"
                );
                const promotion = (rowData.Promotion?.value || "").replace(
                  /'/g,
                  "''"
                );
                const serviceTickets =
                  parseInt(rowData.ServiceTickets?.value) || 0;
                const serviceRating =
                  parseFloat(rowData.ServiceRating?.value) || 0;
                const probabilityOfChurn =
                  parseFloat(
                    rowData["Probability of Churn"]?.value?.replace("%", "")
                  ) || 0;
                const shapValue = parseFloat(rowData["SHAP Value"]?.value) || 0;
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
                const escapedUsername = (username || "system_user").replace(
                  /'/g,
                  "''"
                );

                // Version history approach: Always INSERT, determine version based on existing records
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
              model_feedback, comments, created_by, modified_by, created_at, modified_at, version
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
              next_version
            FROM version_info;`;

                sqlStatements.push(sql);
                console.log(`Generated version history SQL for ${accountId}`);
              } catch (error) {
                console.error(`Error processing account ${accountId}:`, error);
              }
            }
          }

          if (sqlStatements.length === 0) {
            processingIndicator.remove();
            showMessage("No changes to save", "warning");
            return;
          }

          console.log(
            `Generated ${sqlStatements.length} SQL statements for database`
          );

          let successCount = 0;
          const errors = [];
          const fullWebhookUrl = `${ENV.DB_SAVE_WEBHOOK_URL}?X-Execution-Token=${ENV.DB_SAVE_TOKEN}`;

          for (let i = 0; i < sqlStatements.length; i++) {
            const payload = sqlStatements[i];

            try {
              console.log(
                `Sending SQL statement ${i + 1}/${
                  sqlStatements.length
                } to automation`
              );

              const response = await fetch(fullWebhookUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "text/plain",
                  "User-Agent": "Qlik-Writeback-Extension-DB",
                },
                body: payload,
              });

              if (response.ok) {
                const result = await response.text();
                successCount++;
                console.log(
                  `SQL statement ${i + 1} executed successfully:`,
                  result
                );
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

            if (i < sqlStatements.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }

          processingIndicator.remove();

          if (errors.length === 0) {
            console.log("All SQL statements executed successfully");
            setEditedData({});
            setHasUnsavedChanges(false);
            showMessage(
              `Successfully saved ${successCount} records to database`,
              "success"
            );
            // ---- IMMEDIATE REFRESH FROM DB ----
            try {
              //const appId = "qlik_app_" + (model?.id || "default");
              const appId = getConsistentAppId(model); // Use the new function
              fetchLatestWritebacks(appId).then((latestWritebacks) => {
                // Safely merge into latest tableData
                setTableData((prevData) => {
                  if (!prevData || !prevData.rows) return prevData;
                  const mergedRows = mergeWritebackData(
                    prevData.rows,
                    latestWritebacks
                  );
                  return { ...prevData, rows: mergedRows };
                });
              });
            } catch (err) {
              console.warn(
                "Could not fetch/merge latest writebacks after save:",
                err
              );
            }
          } else {
            console.error("Some SQL statements failed:", errors);
            showMessage(
              `Saved ${successCount}/${sqlStatements.length} records. ${errors.length} failed.`,
              errors.length === sqlStatements.length ? "error" : "warning"
            );
          }
        } catch (error) {
          console.error("Error saving to database:", error);
          showMessage(`Error saving changes: ${error.message}`, "error");
        } finally {
          // Reset saving state
          setIsSaving(false);
          // Re-enable save buttons
          saveButtons.forEach((btn) => {
            btn.disabled = false;
            btn.classList.remove("saving");
            btn.textContent = "Save All Changes";
          });
        }
      };

      // Function to get latest version of records for reading/display
      /*      const getLatestVersions = () => {
        // This would be used when loading data to show only the latest version
        // SQL query would be something like:
        const latestVersionQuery = `
    SELECT DISTINCT ON (app_id, account_id) *
    FROM writeback_data 
    WHERE app_id = '${appId}'
    ORDER BY app_id, account_id, version DESC;
  `;

        // Or using window functions:
        const latestVersionQueryAlt = `
    SELECT * FROM (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY app_id, account_id ORDER BY version DESC) as rn
      FROM writeback_data 
      WHERE app_id = '${appId}'
    ) ranked
    WHERE rn = 1;
  `;

        return latestVersionQuery;
      };
 */
      // ADD: Helper function for showing messages
      const showMessage = (text, type) => {
        const message = document.createElement("div");
        message.className = `save-message ${type}`;
        message.textContent = text;

        document
          .querySelector(".writeback-table-container")
          ?.appendChild(message);
        setTimeout(() => message?.remove(), 4000);
      };

      // Load saved data from localStorage
      useEffect(() => {
        try {
          const savedDataStr = localStorage.getItem(
            "qlik-writeback-table-data"
          );
          if (savedDataStr) {
            const savedData = JSON.parse(savedDataStr);
            setEditedData(savedData.changes || {});
            console.log("Loaded saved changes from local storage:", savedData);
          }
        } catch (err) {
          console.error("Error loading from local storage:", err);
        }
      }, []);

      useEffect(() => {
        // Generate a unique ID for this layout
        const layoutId = layout.qInfo?.qId || "";
        console.log(
          `Layout effect triggered. Layout ID: ${layoutId}, Previous: ${lastLayoutId}`
        );
        console.log("Current user changed page flag:", userChangedPage);

        if (layout && layout.qHyperCube) {
          // Get total row count from the hypercube
          const totalRowCount = layout.qHyperCube.qSize.qcy;
          console.log(`Total rows in hypercube: ${totalRowCount}`);

          // IMPORTANT: Only process if this is really a new layout or data has changed
          const isNewLayout = layoutId !== lastLayoutId;
          const dataChanged = totalRowCount !== totalRows;

          console.log(
            `Is new layout: ${isNewLayout}, Data changed: ${dataChanged}`
          );

          // Store the new layout ID
          if (isNewLayout) {
            setLastLayoutId(layoutId);
          }

          setTotalRows(totalRowCount);

          // Completely prevent page reset when user has changed the page
          const shouldResetToPageOne =
            !userChangedPage &&
            (isNewLayout || dataChanged) &&
            !(layout.qSelectionInfo && layout.qSelectionInfo.qInSelections);

          console.log(`Should reset to page 1: ${shouldResetToPageOne}`);

          // Only change the page if we should reset
          if (shouldResetToPageOne) {
            console.log("Resetting to page 1 due to data change");
            setCurrentPage(1);
          } else {
            console.log(`Maintaining current page: ${currentPage}`);
          }

          // Calculate pagination info for the current page
          const pageSize = getPageSize();
          const pageToUse = shouldResetToPageOne ? 1 : currentPage;

          const paginationInfo = calculatePaginationInfo(
            totalRowCount,
            pageSize,
            pageToUse
          );
          setPaginationInfo(paginationInfo);

          console.log("=== Starting DB data fetch and merge ===");
          //const appId = "qlik_app_" + (model?.id || "default");
          const appId = getConsistentAppId(model); // Use the new function
          console.log("Using app_id for fetch:", appId);

          // --- UPDATED: Process data with improved merge logic ---
          // In your useEffect, find the processLayoutData function and modify it like this:
          const processLayoutData = async () => {
            let qlikFormattedData;

            // Always process page data (fetch from Qlik model if not page 1)
            if (shouldResetToPageOne || pageToUse === 1) {
              qlikFormattedData = processData({ layout });
            } else {
              try {
                const pageData = await fetchPageData(pageToUse);
                if (pageData && pageData.length > 0) {
                  qlikFormattedData = processData({ layout, pageData });
                } else {
                  qlikFormattedData = processData({ layout });
                  setCurrentPage(1);
                }
              } catch (error) {
                console.error("Error fetching page data:", error);
                qlikFormattedData = processData({ layout });
                setCurrentPage(1);
              }
            }

            // --- ENHANCED: Fetch and merge DB writeback data ---
            console.log("=== Starting DB data fetch and merge ===");
            const appId = getConsistentAppId(model);
            console.log("Using app_id for fetch:", appId);

            let mergedRows = qlikFormattedData.rows;

            try {
              const latestWritebacks = await fetchLatestWritebacks(appId);
              console.log("Raw fetched writeback data:", latestWritebacks);

              if (latestWritebacks && latestWritebacks.length > 0) {
                console.log(
                  "Processing",
                  latestWritebacks.length,
                  "writeback records"
                );
                mergedRows = mergeWritebackData(
                  qlikFormattedData.rows,
                  latestWritebacks
                );

                // *** DEBUG CODE ***
                console.log("=== POST-MERGE DEBUG ===");
                console.log("Total merged rows:", mergedRows.length);

                // Check first 5 rows
                mergedRows.slice(0, 5).forEach((row, index) => {
                  const accountId =
                    row.AccountID?.value ||
                    row.accountId?.value ||
                    row.account_id?.value;
                  const statusValue = row.status?.value || "empty";
                  const commentsValue = row.comments?.value || "empty";

                  console.log(
                    `Row ${index}: AccountID=${accountId}, Status=${statusValue}, Comments=${commentsValue}`
                  );
                });

                // Count how many rows have writeback data
                const rowsWithData = mergedRows.filter(
                  (row) =>
                    (row.status?.value && row.status.value !== "") ||
                    (row.comments?.value && row.comments.value !== "")
                );
                console.log("Rows with writeback data:", rowsWithData.length);

                if (rowsWithData.length > 1) {
                  console.log(
                    "=== ERROR: Multiple rows have writeback data when only aa16889 should ==="
                  );
                  rowsWithData.forEach((row, index) => {
                    const accountId =
                      row.AccountID?.value ||
                      row.accountId?.value ||
                      row.account_id?.value;
                    console.log(`Unexpected writeback on: ${accountId}`);
                  });
                }
                // *** END DEBUG CODE ***

                console.log(
                  "Successfully merged writeback data into",
                  mergedRows.length,
                  "table rows"
                );
              } else {
                console.log(
                  "No writeback data found - using original Qlik data"
                );
              }
            } catch (err) {
              console.error("Error fetching/merging DB writeback data:", err);
              console.log("Falling back to original Qlik data without merge");
            }

            // Set the final table data
            setTableData({ ...qlikFormattedData, rows: mergedRows });
            console.log("=== Table data updated with merge complete ===");
          };
          // REMOVE THE DEBUG CODE FROM WHERE YOU PLACED IT
          // The debug code should be removed entirely since we've confirmed it works

          processLayoutData();

          console.log(
            `Pagination setup complete: page ${pageToUse} of ${paginationInfo.totalPages}`
          );
        }
      }, [layout, totalRows, currentPage, userChangedPage]); // Keep same dependencies
      // Render the table when tableData or editedData changes
      useEffect(() => {
        try {
          console.log("index.js: Table data effect triggered", tableData);

          // Check if we have data to display
          if (!tableData) {
            console.log("index.js: No table data available yet");
            element.innerHTML = `
              <div style="padding: 20px; text-align: center;">
                <p>Add dimensions and measures to see data</p>
              </div>
            `;
            return;
          }

          // Skip rendering in selection mode to avoid visual glitches
          if (layout.qSelectionInfo && layout.qSelectionInfo.qInSelections) {
            console.log("index.js: In selection mode, skipping render");
            return;
          }

          console.log("index.js: Starting table render");

          // Clear previous content
          element.innerHTML = "";

          // Create container for the table and pagination
          const container = document.createElement("div");
          container.className = "writeback-table-container";
          element.appendChild(container);

          // Create table wrapper for scrolling
          const tableWrapper = document.createElement("div");
          tableWrapper.className = "table-scroll-wrapper";
          container.appendChild(tableWrapper);

          // Create table DOM structure
          const table = document.createElement("table");
          table.className = "writeback-table";
          tableWrapper.appendChild(table);

          // ---- TABLE HEADER SECTION ----
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");

          // Function to apply sorting
          const applySort = (headerObj, direction, forceSort = false) => {
            try {
              console.log(
                `index.js: Applying ${direction} sort for ${headerObj.type} ${headerObj.id}`
              );

              // Begin selection mode for patching
              model.beginSelections(["/qHyperCubeDef"]);

              // Different handling for dimensions and measures
              if (headerObj.type === "dimension") {
                // Find the dimension index
                const dimensions = layout.qHyperCube.qDimensionInfo || [];
                const dimIndex = dimensions.findIndex(
                  (d) => d.qFallbackTitle === headerObj.id
                );

                if (dimIndex !== -1) {
                  // Create direction value for Qlik (1 for asc, -1 for desc)
                  const sortValue =
                    direction === "asc" ? 1 : direction === "desc" ? -1 : 0;

                  // Create sort criteria
                  const sortCriteria = {
                    qSortByState: 0,
                    qSortByFrequency: 0,
                    qSortByNumeric: 0,
                    qSortByAscii: sortValue,
                    qSortByLoadOrder: 0,
                    qSortByExpression: 0,
                  };

                  // Reset any measure sorting first and set column sort order
                  const patches = [
                    {
                      qPath: `/qHyperCubeDef/qDimensions/${dimIndex}/qDef/qSortCriterias/0`,
                      qOp: "replace",
                      qValue: JSON.stringify(sortCriteria),
                    },
                    {
                      qPath: "/qHyperCubeDef/qInterColumnSortOrder",
                      qOp: "replace",
                      qValue: JSON.stringify([dimIndex]), // Ensure we're sorting by this dimension
                    },
                  ];

                  // Apply both patches
                  model.applyPatches(patches, true);
                }
              } else if (headerObj.type === "measure") {
                // For measures
                const dimensions = layout.qHyperCube.qDimensionInfo || [];
                const measures = layout.qHyperCube.qMeasureInfo || [];
                const measIndex = measures.findIndex(
                  (m) => m.qFallbackTitle === headerObj.id
                );

                if (measIndex !== -1) {
                  // Calculate the sortIndex for this measure
                  const sortIndex = dimensions.length + measIndex;

                  // Get current sort order
                  const currentSortOrder =
                    layout.qHyperCube.qEffectiveInterColumnSortOrder || [];
                  const isCurrentlySorted =
                    currentSortOrder.length === 1 &&
                    currentSortOrder[0] === sortIndex;

                  // Apply or toggle sort
                  let newSortOrder;
                  if (!isCurrentlySorted || forceSort) {
                    // Not sorted by this measure yet, or forcing sort
                    newSortOrder = [sortIndex];
                    console.log(
                      `Setting sort to measure at index ${sortIndex}`
                    );
                  } else {
                    // Already sorted, toggle off or use first dimension
                    const defaultSort = dimensions.length > 0 ? [0] : [];
                    newSortOrder = defaultSort;
                    console.log(
                      `Resetting sort to default: ${JSON.stringify(
                        defaultSort
                      )}`
                    );
                  }

                  // Apply the sort order
                  model.applyPatches(
                    [
                      {
                        qPath: "/qHyperCubeDef/qInterColumnSortOrder",
                        qOp: "replace",
                        qValue: JSON.stringify(newSortOrder),
                      },
                    ],
                    true
                  );
                }
              }

              // End selection mode to apply changes
              model.endSelections(true);
            } catch (err) {
              console.error("Sorting error:", err);
              // Try to end selections even if there was an error
              try {
                model.endSelections(true);
              } catch (endErr) {
                console.error("Error ending selections:", endErr);
              }
            }
          };

          tableData.headers.forEach((header) => {
            console.log(`index.js: Creating header for ${header.id}`);

            const th = document.createElement("th");
            th.textContent = header.label;
            th.setAttribute("data-field", header.id);
            th.setAttribute("data-type", header.type);

            // Add sorting capability if enabled in properties
            if (
              layout.tableOptions?.allowSorting &&
              header.type !== "writeback"
            ) {
              th.className = "sortable";

              // Create sort icon container
              const sortIconContainer = document.createElement("div");
              sortIconContainer.className = "sort-icon-container";

              // Create ascending sort icon (▲)
              const ascIcon = document.createElement("span");
              ascIcon.className = "sort-icon asc-icon";
              ascIcon.textContent = "▲";
              ascIcon.title = "Sort ascending";

              // Create descending sort icon (▼)
              const descIcon = document.createElement("span");
              descIcon.className = "sort-icon desc-icon";
              descIcon.textContent = "▼";
              descIcon.title = "Sort descending";

              // Add icons if they should be shown
              if (layout.sortOptions?.showSortIcons !== false) {
                sortIconContainer.appendChild(ascIcon);
                sortIconContainer.appendChild(descIcon);
                th.appendChild(sortIconContainer);
              }

              // Check if this column is sorted and highlight the appropriate icon
              if (header.meta && header.meta.sortDirection) {
                if (header.meta.sortDirection === "asc") {
                  ascIcon.classList.add("active");
                } else if (header.meta.sortDirection === "desc") {
                  descIcon.classList.add("active");
                }
              }

              // Add click handler to the whole header
              th.addEventListener("click", () => {
                console.log(`index.js: Sort clicked for ${header.id}`);

                // Get the default sort direction from properties or use ascending
                const defaultDirection =
                  layout.sortOptions?.defaultDirection || "asc";

                // Apply the sort using the default direction
                applySort(header, defaultDirection);
              });

              // Add click handlers to the sort icons
              ascIcon.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent header click from firing
                console.log(
                  `index.js: Sort ascending clicked for ${header.id}`
                );
                applySort(header, "asc");
              });

              descIcon.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent header click from firing
                console.log(
                  `index.js: Sort descending clicked for ${header.id}`
                );
                applySort(header, "desc");
              });
            }

            headerRow.appendChild(th);
          });

          thead.appendChild(headerRow);
          table.appendChild(thead);

          // ---- TABLE BODY SECTION ----
          const tbody = document.createElement("tbody");
          table.appendChild(tbody);

          tableData.rows.forEach((row, rowIndex) => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-row", rowIndex);

            // Apply selected class if this is the selected row
            if (rowIndex === selectedRow) {
              tr.classList.add("selected-row");
            }

            // Apply alternating row colors if enabled
            if (layout.tableOptions?.rowAlternation && rowIndex % 2 === 1) {
              tr.classList.add("alternate");
            }

            // Create cells for each column in the row
            tableData.headers.forEach((header) => {
              const td = document.createElement("td");
              const cellData = row[header.id];

              // Handle writeback columns (editable inputs)
              if (header.type === "writeback") {
                // Create different inputs based on the column type
                if (header.id === "status") {
                  // Create dropdown for status column
                  const selectContainer = document.createElement("div");
                  selectContainer.className = "status-select-container";

                  const select = document.createElement("select");
                  select.className = "status-select";

                  // Get a unique ID for this cell based on the account ID, not the row index
                  const accountId = row.AccountID
                    ? row.AccountID.value
                    : `row-${rowIndex}-page-${currentPage}`;
                  const dataKey = `${accountId}-${header.id}`;

                  // Use edited value if it exists, otherwise use default
                  const selectedValue =
                    editedData[dataKey] || cellData.value || "";

                  // Create options for the dropdown
                  const options = [
                    { value: "", text: "N/A", className: "" },
                    {
                      value: "Accurate",
                      text: "Accurate",
                      className: "thumbs-up",
                    },
                    {
                      value: "Inaccurate",
                      text: "Inaccurate",
                      className: "thumbs-down",
                    },
                  ];

                  // Add options to select
                  options.forEach((opt) => {
                    const option = document.createElement("option");
                    option.value = opt.value;
                    option.text = opt.text;
                    if (opt.className) {
                      option.className = opt.className;
                    }
                    if (selectedValue === opt.value) {
                      option.selected = true;
                    }
                    select.appendChild(option);
                  });

                  // Create a span to show the icon
                  const statusIcon = document.createElement("span");
                  statusIcon.className = "status-icon";

                  // Set initial icon and color based on current value
                  if (selectedValue === "Accurate") {
                    // Change the value to match
                    statusIcon.innerHTML = "👍"; // Keep the thumbs up icon
                    statusIcon.classList.add("thumbs-up-icon");
                    selectContainer.classList.add("status-green");
                  } else if (selectedValue === "Inaccurate") {
                    // Change the value to match
                    statusIcon.innerHTML = "👎"; // Keep the thumbs down icon
                    statusIcon.classList.add("thumbs-down-icon");
                    selectContainer.classList.add("status-red");
                  }
                  // Handle changes to the dropdown
                  select.addEventListener("change", (e) => {
                    console.log(
                      `index.js: Status changed for row ${rowIndex}:`,
                      e.target.value
                    );

                    // Store the edited value using accountId-based key
                    setEditedData((prev) => ({
                      ...prev,
                      [dataKey]: e.target.value,
                    }));

                    // Set flag for unsaved changes
                    setHasUnsavedChanges(true);

                    // Update icon and color
                    if (e.target.value === "Accurate") {
                      // Change the value to match
                      statusIcon.innerHTML = "👍"; // Keep the thumbs up icon
                      statusIcon.className = "status-icon thumbs-up-icon";
                      selectContainer.className =
                        "status-select-container status-green";
                    } else if (e.target.value === "Inaccurate") {
                      // Change the value to match
                      statusIcon.innerHTML = "👎"; // Keep the thumbs down icon
                      statusIcon.className = "status-icon thumbs-down-icon";
                      selectContainer.className =
                        "status-select-container status-red";
                    } else {
                      statusIcon.innerHTML = "";
                      statusIcon.className = "status-icon";
                      selectContainer.className = "status-select-container";
                    }
                    console.log(
                      `index.js: Writing back status: ${e.target.value} for account ${accountId}`
                    );
                  });

                  selectContainer.appendChild(statusIcon);
                  selectContainer.appendChild(select);
                  td.appendChild(selectContainer);
                } else {
                  // Other writeback columns (e.g., comments) still use text input
                  const input = document.createElement("input");
                  input.type = "text";
                  input.className = "comments-input";

                  // Get a unique ID for this cell based on the account ID, not the row index
                  const accountId = row.AccountID
                    ? row.AccountID.value
                    : `row-${rowIndex}-page-${currentPage}`;
                  const dataKey = `${accountId}-${header.id}`;

                  // Use edited value if it exists, otherwise use default
                  input.value = editedData[dataKey] || cellData.value;

                  // Handle changes to the input field
                  input.addEventListener("change", (e) => {
                    console.log(
                      `index.js: Value changed for ${header.id} at row ${rowIndex}:`,
                      e.target.value
                    );

                    // Store the edited value using accountId-based key
                    setEditedData((prev) => ({
                      ...prev,
                      [dataKey]: e.target.value,
                    }));

                    // Set flag for unsaved changes
                    setHasUnsavedChanges(true);
                    // ADDED: Directly enable save buttons in DOM
                    const saveButtons =
                      document.querySelectorAll(".save-all-button");
                    saveButtons.forEach((btn) => {
                      btn.disabled = false;
                    });
                    console.log(
                      `index.js: Writing back data: ${e.target.value} for account ${accountId}, field ${header.id}`
                    );
                  });

                  td.appendChild(input);
                }
              } else {
                // Special formatting for Probability of Churn column
                if (header.id === "Probability of Churn") {
                  // Create a container for the bar and text
                  const barContainer = document.createElement("div");
                  barContainer.className = "churn-bar-container";

                  // Add the text display for the value
                  const valueText = document.createElement("span");
                  valueText.className = "churn-value-text";
                  valueText.textContent = cellData.value;

                  // Create the progress bar
                  const progressBar = document.createElement("div");
                  progressBar.className = "churn-progress-bar";

                  // Get the numeric value (removing % symbol if present)
                  let numValue = parseFloat(cellData.value.replace("%", ""));
                  if (isNaN(numValue)) {
                    // Try getting the numeric value from the qNum property if available
                    numValue = cellData.qNum || 0;
                  }

                  // Set the width of the progress bar based on the value
                  progressBar.style.width = `${numValue}%`;

                  // Set color based on the value
                  if (numValue >= 90) {
                    progressBar.classList.add("high-risk");
                  } else if (numValue >= 30) {
                    progressBar.classList.add("medium-risk");
                  } else if (numValue > 5) {
                    progressBar.classList.add("low-risk");
                  } else {
                    progressBar.classList.add("very-low-risk");
                  }

                  // Add elements to the container
                  barContainer.appendChild(progressBar);
                  barContainer.appendChild(valueText);

                  // Add the container to the cell
                  td.appendChild(barContainer);
                } else {
                  // Regular cell for dimensions and measures (non-editable)
                  td.textContent = cellData.value;
                }

                // Add selection capability for dimension cells if enabled
                if (
                  cellData.selectable &&
                  layout.tableOptions?.allowSelections
                ) {
                  td.className = "selectable";
                  td.setAttribute(
                    "data-col",
                    tableData.headers.indexOf(header)
                  );
                  td.setAttribute("data-elem-number", cellData.qElemNumber);

                  // Add click handler for the working selection approach
                  td.addEventListener("click", function () {
                    try {
                      // Visual feedback
                      const allRows = tbody.querySelectorAll("tr");
                      allRows.forEach((r) =>
                        r.classList.remove("selected-row")
                      );
                      tr.classList.add("selected-row");

                      // Store selected row for highlighting
                      setSelectedRow(rowIndex);

                      // Get element number
                      const qElemNumber = cellData.qElemNumber;

                      // Only proceed if not already in selection mode
                      if (!selections.isActive()) {
                        console.log(
                          `Starting selection for ${header.id}, elem: ${qElemNumber}`
                        );

                        // Begin selection mode - THIS IS CRITICAL FOR THE SELECTION UI TO APPEAR
                        selections.begin("/qHyperCubeDef");

                        // Look up dimensions from layout to find the dimension index
                        const dimensions =
                          layout.qHyperCube.qDimensionInfo || [];
                        let dimIndex = -1;

                        for (let i = 0; i < dimensions.length; i++) {
                          if (dimensions[i].qFallbackTitle === header.id) {
                            dimIndex = i;
                            break;
                          }
                        }

                        if (dimIndex !== -1) {
                          console.log(
                            `Found dimension at index ${dimIndex}, selecting element ${qElemNumber}`
                          );

                          // Use the standard hypercube selection API - most compatible with Qlik UI
                          selections.select({
                            method: "selectHyperCubeCells",
                            params: [
                              "/qHyperCubeDef", // Path to hypercube
                              [
                                (currentPage - 1) * paginationInfo.pageSize +
                                  rowIndex,
                              ], // Global row index
                              [dimIndex], // Column index (dimension index)
                            ],
                          });
                        } else {
                          console.error(
                            `Could not find dimension index for: ${header.id}`
                          );
                        }
                      }
                    } catch (err) {
                      console.error("Error in selection handler:", err);
                      if (selections.isActive()) {
                        selections.cancel();
                      }
                    }
                  });
                }
              }

              tr.appendChild(td);
            });

            tbody.appendChild(tr);
          });

          // Create loading overlay for pagination
          const loadingOverlay = document.createElement("div");
          loadingOverlay.className =
            "loading-overlay" + (isLoading ? " active" : "");
          loadingOverlay.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">Loading data...</div>
          `;
          container.appendChild(loadingOverlay);

          // Only show pagination if enabled in properties
          const paginationEnabled = layout.paginationOptions?.enabled !== false;

          // Create pagination controls if pagination is enabled and we have more than one page
          if (paginationEnabled && paginationInfo.totalPages > 0) {
            console.log(
              `Creating pagination controls. Total pages: ${paginationInfo.totalPages}`
            );

            // Create pagination container
            const paginationContainer = document.createElement("div");
            paginationContainer.className = "pagination-container";

            // Display rows info (e.g., "Showing 1-100 of 414 records")
            const rowsInfo = document.createElement("div");
            rowsInfo.className = "rows-info";
            rowsInfo.textContent = `Showing ${paginationInfo.currentPageFirstRow}–${paginationInfo.currentPageLastRow} of ${totalRows} records`;
            paginationContainer.appendChild(rowsInfo);

            // Create pagination buttons container
            const paginationControls = document.createElement("div");
            paginationControls.className = "pagination-controls";

            // Previous page button
            const prevButton = document.createElement("button");
            prevButton.className =
              "pagination-button prev-button" +
              (currentPage <= 1 ? " disabled" : "");
            prevButton.innerHTML = "← Prev";
            prevButton.disabled = currentPage <= 1;
            prevButton.addEventListener("click", () => {
              if (currentPage > 1) {
                changePage(currentPage - 1);
              }
            });
            paginationControls.appendChild(prevButton);

            // Page number input
            const pageNumberContainer = document.createElement("div");
            pageNumberContainer.className = "page-number-container";

            const pageInput = document.createElement("input");
            pageInput.type = "text";
            pageInput.className = "page-input";
            pageInput.value = currentPage;
            pageInput.size = 3;
            pageInput.addEventListener("keydown", (e) => {
              if (e.key === "Enter") {
                const newPage = parseInt(e.target.value, 10);
                if (
                  !isNaN(newPage) &&
                  newPage > 0 &&
                  newPage <= paginationInfo.totalPages
                ) {
                  changePage(newPage);
                } else {
                  // Invalid page, reset to current
                  e.target.value = currentPage;
                }
              }
            });
            pageNumberContainer.appendChild(pageInput);

            const pageTotal = document.createElement("span");
            pageTotal.className = "page-total";
            pageTotal.textContent = ` / ${paginationInfo.totalPages}`;
            pageNumberContainer.appendChild(pageTotal);

            paginationControls.appendChild(pageNumberContainer);

            // Next page button
            const nextButton = document.createElement("button");
            nextButton.className =
              "pagination-button next-button" +
              (currentPage >= paginationInfo.totalPages ? " disabled" : "");
            nextButton.innerHTML = "Next →";
            nextButton.disabled = currentPage >= paginationInfo.totalPages;
            nextButton.addEventListener("click", () => {
              if (currentPage < paginationInfo.totalPages) {
                changePage(currentPage + 1);
              }
            });
            paginationControls.appendChild(nextButton);

            paginationContainer.appendChild(paginationControls);

            // Add save changes button for writeback

            if (layout.tableOptions?.allowWriteback) {
              // Add save changes button for writeback
              if (layout.tableOptions?.allowWriteback) {
                const saveButtonContainer = document.createElement("div");
                saveButtonContainer.className = "save-button-container";

                const saveButton = document.createElement("button");
                saveButton.className = "save-all-button";
                saveButton.textContent = "Save All Changes";

                // Start with the button disabled (gray) - NOW INCLUDES isSaving CHECK
                saveButton.disabled = !hasUnsavedChanges || isSaving;

                // Modified click handler with better event handling
                saveButton.addEventListener(
                  "click",
                  (e) => {
                    // Prevent multiple clicks
                    e.preventDefault();
                    e.stopPropagation();

                    // Double check that we're not already saving
                    if (!isSaving && hasUnsavedChanges) {
                      console.log("Save button clicked, starting save process");
                      saveAllChanges();
                    } else {
                      console.log(
                        "Save ignored - either already saving or no changes"
                      );
                    }
                  },
                  { once: false }
                ); // Allow multiple clicks but we handle them properly

                saveButtonContainer.appendChild(saveButton);
                paginationContainer.appendChild(saveButtonContainer);
              }
            }
            container.appendChild(paginationContainer);
            console.log("Pagination controls added to DOM");
          } else {
            console.log(
              "Pagination disabled or only one page - not showing controls"
            );
          }

          // Add CSS styling
          const style = document.createElement("style");
          style.textContent = `
            /* Container styling */
            .writeback-table-container {
              position: relative;
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
              border: 1px solid #ddd;
              font-family: Arial, sans-serif;
            }
            
            /* Table scroll wrapper - THIS IS CRUCIAL FOR SCROLLING */
            .table-scroll-wrapper {
              flex: 1;
              overflow-y: auto;
              overflow-x: auto;
              min-height: 100px;
              max-height: calc(100% - 50px); /* Leave space for pagination */
            }
            
            /* Base table styling */
            .writeback-table {
              width: 100%;
              border-collapse: collapse;
            }
            
            /* Header styling */
            .writeback-table th {
              background-color: #f2f2f2;
              padding: 10px 8px;
              text-align: left;
              border-bottom: 2px solid #ddd;
              border-right: 1px solid #ddd;
              cursor: default;
              position: relative;
              font-weight: bold;
              position: sticky;
              top: 0;
              z-index: 10;
            }
            
            /* Add left border to the first cell in each row */
            .writeback-table td:first-child,
            .writeback-table th:first-child {
               border-left: 1px solid #ddd;
            }

            /* Sortable header styling */
            .writeback-table th.sortable {
              cursor: pointer;
              padding-right: 32px; /* Make room for sort icons */
            }
            
            /* Sort icon container */
            .sort-icon-container {
              position: absolute;
              right: 8px;
              top: 50%;
              transform: translateY(-50%);
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            
            /* Sort icon styling */
            .sort-icon {
              font-size: 10px;
              color: #aaa;
              cursor: pointer;
              margin: -2px 0;
            }
            
            /* Active sort icon */
            .sort-icon.active {
              color: #333;
            }
            
            /* Hover effect for sort icons */
            .sort-icon:hover {
              color: #666;
            }
            
            /* Cell styling */
            .writeback-table td {
              padding: 8px;
              border-bottom: 1px solid #ddd;
              border-right: 1px solid #ddd; 
              transition: background-color 0.15s ease;
            }
            
            /* Alternating row styling */
            .writeback-table tr.alternate {
              background-color: #f9f9f9;
            }
            
            /* Selectable cell styling */
            .writeback-table td.selectable {
              cursor: pointer;
            }
            
            .writeback-table td.selectable:hover {
              background-color: #f5f5f5;
            }
            
            /* Selected row styling */
            .writeback-table tr.selected-row td {
              background-color: #e6ffe6 !important;
              border-bottom: 1px solid #b3ffb3;
              font-weight: bold;
              transition: all 0.15s ease;
            }
            
            /* Input field styling */
            .writeback-table input {
              width: 100%;
              padding: 6px;
              box-sizing: border-box;
              border: 1px solid #ddd;
            }
            
            /* Explicit scrollbar styling for better visibility */
            .table-scroll-wrapper::-webkit-scrollbar {
              width: 10px;
              height: 10px;
            }
            
            .table-scroll-wrapper::-webkit-scrollbar-track {
              background: #f0f0f0;
              border-radius: 4px;
            }
            
            .table-scroll-wrapper::-webkit-scrollbar-thumb {
              background-color: #aaa;
              border-radius: 4px;
              border: 2px solid #f0f0f0;
            }
            
            .table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
              background-color: #888;
            }
            
            /* Pagination styling */
            .pagination-container {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px;
              background-color: #f8f8f8;
              border-top: 1px solid #ddd;
              min-height: 40px;
              flex-shrink: 0; /* Prevent pagination from being compressed */
            }
            
            .rows-info {
              color: #666;
              font-size: 14px;
            }
            
            .pagination-controls {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            
            .pagination-button {
              padding: 6px 12px;
              background-color: #fff;
              border: 1px solid #ddd;
              border-radius: 3px;
              cursor: pointer;
              font-size: 14px;
              transition: all 0.2s ease;
            }
            
            .pagination-button:hover:not(.disabled) {
              background-color: #f0f0f0;
              border-color: #ccc;
            }
            
            .pagination-button.disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }
            
            .page-number-container {
              display: flex;
              align-items: center;
            }
            
            .page-input {
              width: 50px;
              padding: 6px;
              text-align: center;
              border: 1px solid #ddd;
              border-radius: 3px;
            }
            
            .page-total {
              color: #666;
            }
            
         
            
            /* Loading overlay */
            .loading-overlay {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: rgba(255, 255, 255, 0.7);
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              z-index: 100;
              visibility: hidden;
              opacity: 0;
              transition: opacity 0.3s ease, visibility 0s linear 0.3s;
            }
            
            .loading-overlay.active {
              visibility: visible;
              opacity: 1;
              transition-delay: 0s;
            }
            
            .spinner {
              border: 4px solid #f3f3f3;
              border-top: 4px solid #3498db;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
            }
            
            .loading-text {
              margin-top: 10px;
              font-weight: bold;
              color: #333;
            }
            
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }

            /* Save All Changes button styling */
            .save-all-button {
              padding: 8px 16px;
              background-color: #4285f4;
              color: white;
              border: none;
              border-radius: 3px;
              cursor: pointer;
              font-weight: bold;
              transition: background-color 0.2s ease;
            }

            .save-all-button:hover {
              background-color: #3367d6;
            }

            .save-all-button:disabled {
              background-color: #cccccc;
              cursor: not-allowed;
            }

            .save-all-button.saving {
              background-color: #orange;
              cursor: wait;
            }

            .save-all-button.saving::after {
              content: " (Saving...)";
            }

            /* Save message notification */
            .save-message {
              position: fixed;
              bottom: 20px;
              right: 20px;
              background-color: #4CAF50;
              color: white;
              padding: 10px 20px;
              border-radius: 4px;
              font-weight: bold;
              box-shadow: 0 2px 10px rgba(0,0,0,0.2);
              z-index: 1000;
              animation: fadeInOut 3s ease-in-out;
            }

            @keyframes fadeInOut {
              0% { opacity: 0; transform: translateY(20px); }
              10% { opacity: 1; transform: translateY(0); }
              90% { opacity: 1; transform: translateY(0); }
              100% { opacity: 0; transform: translateY(20px); }
            }
              /* Status dropdown styling */
            .status-select-container {
              display: flex;
              align-items: center;
              padding: 4px 8px;
              border-radius: 4px;
              background-color: #f7f7f7;
            }

            .status-green {
              background-color: #e6ffe6;
            }

            .status-red {
              background-color: #ffe6e6;
            }

            .status-icon {
              margin-right: 8px;
              font-size: 16px;
            }

            .status-select {
              flex: 1;
              padding: 4px;
              border: 1px solid #ddd;
              border-radius: 3px;
              background-color: white;
            }

            .comments-input {
              width: 100%;
              padding: 6px;
              border: 1px solid #ddd;
              border-radius: 3px;
            }

            /* Dropdown options styling */
            .thumbs-up-icon {
              color: #4CAF50;
            }

            .thumbs-down-icon {
              color: #f44336;
            }
              /* Churn probability bar styling */
            .churn-bar-container {
              position: relative;
              height: 20px;
              width: 100%;
              background-color: #f3f3f3;
              border-radius: 4px;
              overflow: hidden;
            }

            .churn-progress-bar {
              position: absolute;
              height: 100%;
              left: 0;
              top: 0;
              border-radius: 4px;
            }

            .churn-value-text {
              position: absolute;
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              color: #333;
              font-weight: bold;
              text-shadow: 0 0 2px white;
              z-index: 1;
            }

            /* Bar colors */
            .high-risk {
              background-color: #ff4d4d;
            }

            .medium-risk {
              background-color: #ff9900;
            }

            .low-risk {
              background-color: #2ecc71;
            }

            .very-low-risk {
              background-color: #27ae60;
            }
              
          `;

          element.appendChild(style);
          console.log("index.js: Styles added to DOM");
        } catch (err) {
          console.error("Error rendering table:", err);
          element.innerHTML = `<div style="color: red; padding: 20px;">
            <p>Error rendering table: ${err.message}</p>
          </div>`;
        }
      }, [
        tableData,
        editedData,
        layout,
        model,
        selectedRow,
        currentPage,
        totalRows,
        paginationInfo,
        isLoading,
      ]);

      //  useEffect to track selection state changes
      useEffect(() => {
        // Get current selection state
        const isInSelectionMode = !!(
          layout.qSelectionInfo && layout.qSelectionInfo.qInSelections
        );

        // Log selection state changes for debugging
        console.log(
          `Selection state changed: was ${wasInSelectionMode}, is now ${isInSelectionMode}`
        );

        // If we're exiting selection mode, set a special flag to prevent page reset
        if (wasInSelectionMode && !isInSelectionMode) {
          console.log(
            "SELECTION CANCELLED - Setting user changed page to true to prevent reset"
          );
          setUserChangedPage(true);

          // Reset the flag after a delay (same as in changePage)
          const timer = setTimeout(() => {
            setUserChangedPage(false);
            console.log("Reset userChangedPage flag after selection cancel");
          }, 2000);

          // Store the timer for cleanup
          window.selectionResetTimer = timer;
        }

        // Update the previous selection state for next time
        setWasInSelectionMode(isInSelectionMode);

        // Clean up timers if component unmounts
        return () => {
          if (window.selectionResetTimer) {
            clearTimeout(window.selectionResetTimer);
          }
        };
      }, [layout.qSelectionInfo, wasInSelectionMode]);

      // Listen for selection state changes
      useEffect(() => {
        // Reset selected row when leaving selection mode
        if (!selections.isActive() && selectedRow !== null) {
          setSelectedRow(null);
        }
      }, [selections.isActive()]);

      // OPTIONAL: If you want auto-refresh, replace with this improved version:
      useEffect(() => {
        // Only set up auto-refresh if we have valid table data
        if (!tableData || !tableData.rows || tableData.rows.length === 0) {
          return;
        }

        const timer = setInterval(async () => {
          console.log("Auto-refresh: Fetching latest writeback data...");
          //const appId = "qlik_app_" + (model?.id || "default");
          const appId = getConsistentAppId(model); // Use the new function
          try {
            const latestWritebacks = await fetchLatestWritebacks(appId);
            if (latestWritebacks && latestWritebacks.length > 0) {
              setTableData((prevData) => {
                if (!prevData || !prevData.rows) return prevData;
                const mergedRows = mergeWritebackData(
                  prevData.rows,
                  latestWritebacks
                );
                console.log(
                  "Auto-refresh: Merged",
                  latestWritebacks.length,
                  "writeback records"
                );
                return { ...prevData, rows: mergedRows };
              });
            }
          } catch (err) {
            console.warn("Auto-refresh failed:", err);
          }
        }, 30000); // 30 seconds

        return () => clearInterval(timer);
      }, [model?.id]); // Only depend on model ID, not tableData to avoid infinite loops

      // Cleanup function when component is unmounted
      return () => {
        console.log("index.js: Component cleanup");
        element.innerHTML = "";

        // Add these lines to clean up timers
        if (window.resetPageFlagTimer) {
          clearTimeout(window.resetPageFlagTimer);
        }
        if (window.selectionResetTimer) {
          clearTimeout(window.selectionResetTimer);
        }
      };
    },
  };
}
