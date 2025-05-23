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

      // Enhanced saveAllChanges function with better messaging
      const saveAllChanges = async () => {
        console.log("Saving all changes via Qlik Automation:", editedData);

        // Immediately disable all save buttons to prevent multiple clicks
        const saveButtons = document.querySelectorAll(".save-all-button");
        saveButtons.forEach((btn) => {
          btn.disabled = true;
        });

        try {
          // 1. Store in localStorage as backup
          const savedData = {
            timestamp: new Date().toISOString(),
            changes: editedData,
          };
          localStorage.setItem(
            "qlik-writeback-table-data",
            JSON.stringify(savedData)
          );
          console.log("Changes saved to local storage");

          // 2. Show processing indicator
          const processingIndicator = document.createElement("div");
          processingIndicator.className = "save-message processing";
          processingIndicator.innerHTML = `
      <div>Processing via Qlik Automation...</div>
      <div style="font-size: 0.9em; margin-top: 5px;">Uploading to Amazon S3</div>
    `;
          document
            .querySelector(".writeback-table-container")
            .appendChild(processingIndicator);

          // 3. Get metadata
          const username = await getCurrentUsername();
          const saveTimestamp = new Date().toISOString();
          const appId = layout.qInfo.qId.split("_")[0] || "unknown";

          // 4. Format data (same as before)
          const formattedData = [];

          if (tableData && tableData.rows) {
            tableData.rows.forEach((row, rowIndex) => {
              const accountId = row.AccountID
                ? row.AccountID.value
                : `row-${rowIndex}-page-${currentPage}`;

              const hasEditedData = Object.keys(editedData).some((key) =>
                key.startsWith(`${accountId}-`)
              );

              if (hasEditedData) {
                const dataRow = {
                  ModifiedTimestamp: saveTimestamp,
                  ModifiedBy: username,
                  AppID: appId,
                  RowID: accountId,
                };

                // Add dimension values
                tableData.headers.forEach((header) => {
                  if (header.type === "dimension" && row[header.id]) {
                    const cleanColumnName = header.id.replace(/[,"\n\r]/g, "_");
                    dataRow[cleanColumnName] = row[header.id].value || "";
                  }
                });

                // Add measure values
                tableData.headers.forEach((header) => {
                  if (header.type === "measure" && row[header.id]) {
                    const cleanColumnName = header.id.replace(/[,"\n\r]/g, "_");
                    dataRow[cleanColumnName] = row[header.id].value || "";
                  }
                });

                // Add writeback values
                if (layout.tableOptions?.allowWriteback) {
                  const statusKey = `${accountId}-status`;
                  dataRow.Status =
                    editedData[statusKey] ||
                    (row.status ? row.status.value : "");

                  const commentsKey = `${accountId}-comments`;
                  dataRow.Comments =
                    editedData[commentsKey] ||
                    (row.comments ? row.comments.value : "");
                }

                formattedData.push(dataRow);
              }
            });
          }

          if (formattedData.length === 0) {
            processingIndicator.remove();
            const noDataMessage = document.createElement("div");
            noDataMessage.className = "save-message warning";
            noDataMessage.textContent = "No changes to save";
            document
              .querySelector(".writeback-table-container")
              .appendChild(noDataMessage);
            setTimeout(() => noDataMessage.remove(), 3000);
            return;
          }

          // 5. Convert to CSV and upload via automation
          const csvContent = convertToCSV(formattedData);
          //const fileName = `writeback_${appId}_${Date.now()}.csv`;
          const fileName = `latest_feedback.csv`;

          console.log(`Uploading ${formattedData.length} rows via automation`);

          // CHANGE HERE: Use the new S3 upload function instead of the old Qlik one
          const uploadSuccess = await uploadCSVToS3(csvContent, fileName);

          if (uploadSuccess) {
            processingIndicator.remove();
            setHasUnsavedChanges(false);
          }
        } catch (err) {
          console.error("Error in automation save process:", err);

          // Remove processing indicator
          const processingIndicator = document.querySelector(
            ".save-message.processing"
          );
          if (processingIndicator) processingIndicator.remove();

          const errorMessage = document.createElement("div");
          errorMessage.className = "save-message error";
          errorMessage.innerHTML = `
      <div>Upload completed with warnings</div>
      <div style="font-size: 0.9em; margin-top: 5px;">CSV backup downloaded</div>
      <div style="font-size: 0.8em; margin-top: 3px;">Check automation logs for details</div>
    `;
          document
            .querySelector(".writeback-table-container")
            .appendChild(errorMessage);

          setTimeout(() => errorMessage.remove(), 10000);
        } finally {
          // Always re-enable save buttons
          saveButtons.forEach((btn) => {
            btn.disabled = false;
          });
        }
      };

      // Helper function to get current username
      const getCurrentUsername = async () => {
        try {
          // Try multiple approaches to get username
          if (window.qlik && window.qlik.currApp) {
            const user = await window.qlik
              .currApp()
              .global.getAuthenticatedUser();
            return user.qName || user.userId || "unknown_user";
          } else if (galaxy && galaxy.session) {
            const session = galaxy.session;
            if (session.config && session.config.user) {
              return (
                session.config.user.name ||
                session.config.user.sub ||
                "unknown_user"
              );
            }
          }
          return "unknown_user";
        } catch (error) {
          console.log("Could not get username:", error.message);
          return "unknown_user";
        }
      };

      // Helper function to convert data to CSV
      const convertToCSV = (data) => {
        if (!data || data.length === 0) return "";

        // Get headers from first row
        const headers = Object.keys(data[0]);

        // Create CSV header row
        let csv = headers.join(",") + "\n";

        // Add data rows with proper CSV escaping
        data.forEach((row) => {
          const values = headers.map((header) => {
            let value = row[header] || "";
            value = String(value);

            // Escape CSV special characters
            if (
              value.includes(",") ||
              value.includes('"') ||
              value.includes("\n") ||
              value.includes("\r")
            ) {
              value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          });
          csv += values.join(",") + "\n";
        });

        return csv;
      };

      //  uploadCSVToS3 function

      const uploadCSVToS3 = async (csvContent, fileName) => {
        try {
          console.log("Starting Amazon S3 upload via Qlik Automation...");
          console.log("File name:", fileName);

          // Use working automation ID that successfully receives data
          const automationWebhookUrl =
            "https://karthikburra93.us.qlikcloud.com/api/v1/automations/ad18876b-6c22-4b47-9c7f-880250abbe0c/actions/execute";

          // Use  working execution token
          const executionToken =
            "FFD8ETajxESMaoZPBguKApsnhmFTfKTzrfocU0inNdBLhsQm4OcsytVpxwqsn05z";

          // CHANGED: Remove action from URL query parameter - only use execution token
          const fullWebhookUrl = `${automationWebhookUrl}?X-Execution-Token=${executionToken}`;

          // CORRECTED: Match what the S3 automation blocks expect
          const payload = {
            action: "upload_writeback_data",
            fileName: fileName, // Changed back to fileName (matches {$.Start.body.fileName})
            csvContent: csvContent, // Changed back to csvContent (matches {$.Start.body.csvContent})
            timestamp: new Date().toISOString(),
            appId: "uJkrd",
            userAgent: navigator.userAgent,
          };

          console.log("Sending data to S3 automation webhook...");
          console.log("Payload action:", payload.action);
          console.log("Full payload:", payload);

          // Use your proven working fetch call
          const response = await fetch(fullWebhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Qlik-Writeback-Extension",
            },
            body: JSON.stringify(payload),
          });

          console.log(
            "Webhook response:",
            response.status,
            response.statusText
          );

          if (response.ok) {
            let responseData;
            try {
              responseData = await response.json();
              console.log("S3 Automation response:", responseData);
            } catch (e) {
              responseData = await response.text();
              console.log("S3 Automation response (text):", responseData);
            }

            // Show success message
            const successMessage = document.createElement("div");
            successMessage.className = "save-message success";
            successMessage.innerHTML = `
        <div>Data uploaded successfully to Amazon S3!</div>
        <div style="font-size: 0.9em; margin-top: 5px;">Processed via Qlik Automation</div>
        <div style="font-size: 0.8em; margin-top: 3px;">File: writeback-data/${fileName}</div>
        <div style="font-size: 0.8em; margin-top: 3px;">Check kb-writeback-table S3 bucket</div>
      `;

            document
              .querySelector(".writeback-table-container")
              ?.appendChild(successMessage);
            setTimeout(() => successMessage?.remove(), 6000);

            return true;
          } else {
            // Handle error response
            let errorDetails;
            try {
              errorDetails = await response.json();
            } catch (e) {
              errorDetails = await response.text();
            }

            console.error("S3 automation webhook error:", errorDetails);

            const errorMessage = document.createElement("div");
            errorMessage.className = "save-message error";
            errorMessage.innerHTML = `
        <div>Error uploading data</div>
        <div style="font-size: 0.9em; margin-top: 5px;">Please check console for details</div>
      `;

            document
              .querySelector(".writeback-table-container")
              ?.appendChild(errorMessage);
            setTimeout(() => errorMessage?.remove(), 6000);

            throw new Error(
              `Webhook failed: ${response.status} - ${response.statusText}`
            );
          }
        } catch (error) {
          console.error("S3 upload error:", error);
          return false;
        }
      };

      // Function to fetch existing feedback from read automation
      const fetchExistingFeedback = async (appId) => {
        try {
          console.log("Fetching existing feedback for app:", appId);

          // READ automation webhook URL and token
          const readAutomationUrl =
            "https://karthikburra93.us.qlikcloud.com/api/v1/automations/ac226a7e-0c76-4003-bae8-00d355e782f3/actions/execute";
          const readExecutionToken =
            "G6LePb7NiG1ks1324JXILzBtNe7i12mWfhL4ZyXkSC45CShFow3wQ6Bwx98L7jM9";

          const fullReadUrl = `${readAutomationUrl}?X-Execution-Token=${readExecutionToken}`;

          const payload = {
            appId: appId,
          };

          const response = await fetch(fullReadUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Qlik-Writeback-Extension-Read",
            },
            body: JSON.stringify(payload),
          });

          if (response.ok) {
            const responseText = await response.text();
            console.log("Raw response:", responseText);

            // The response is a JSON string, parse it
            let data = JSON.parse(responseText);
            console.log("Raw parsed data:", data);

            // Handle case where automation returns array with JSON string
            if (Array.isArray(data) && data.length > 0) {
              data = JSON.parse(data[0]);
            }

            console.log("Successfully fetched feedback:", data);
            return data.feedbackData || {};
          } else {
            console.warn("Could not fetch existing feedback:", response.status);
            return {};
          }
        } catch (error) {
          console.error("Error fetching feedback:", error);
          return {};
        }
      };

      // Function to merge Qlik data with existing feedback
      const mergeWithExistingFeedback = (qlikTableData, feedbackData) => {
        if (!qlikTableData || !qlikTableData.rows) return qlikTableData;

        console.log("Merging feedback data:", feedbackData);

        const mergedRows = qlikTableData.rows.map((row) => {
          // Get the account ID for this row
          const accountId = row.AccountID ? row.AccountID.value : null;

          if (accountId && feedbackData[accountId]) {
            console.log(
              `Found existing feedback for ${accountId}:`,
              feedbackData[accountId]
            );

            // Update writeback columns with existing feedback
            if (row.status) {
              row.status.value = feedbackData[accountId].status || "";
            }
            if (row.comments) {
              row.comments.value = feedbackData[accountId].comments || "";
            }
          }

          return row;
        });

        return {
          ...qlikTableData,
          rows: mergedRows,
        };
      };

      // Enhanced download function with better user feedback
      const downloadCSV = (csvContent, fileName) => {
        try {
          const blob = new Blob([csvContent], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = fileName;

          // Add the link to the document temporarily
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up the URL
          URL.revokeObjectURL(url);

          console.log("CSV file downloaded:", fileName);
        } catch (error) {
          console.error("Error downloading CSV:", error);
        }
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

      // Then modify the beginning of your layout useEffect:
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

          // Process data appropriately based on page

          const processLayoutData = async () => {
            if (shouldResetToPageOne || pageToUse === 1) {
              // Process first page data from layout
              const qlikFormattedData = processData({ layout });

              // NEW: Fetch existing feedback and merge
              if (layout.tableOptions?.allowWriteback) {
                const appId = layout.qInfo?.qId?.split("_")[0] || "uJkrd";
                console.log("Fetching feedback for appId:", appId);
                const existingFeedback = await fetchExistingFeedback(appId);
                const mergedData = mergeWithExistingFeedback(
                  qlikFormattedData,
                  existingFeedback
                );
                setTableData(mergedData);
              } else {
                setTableData(qlikFormattedData);
              }
            } else {
              // For other pages, fetch page data first, then merge
              try {
                const pageData = await fetchPageData(pageToUse);
                if (pageData && pageData.length > 0) {
                  const qlikFormattedData = processData({ layout, pageData });

                  // NEW: Fetch and merge feedback for this page too
                  if (layout.tableOptions?.allowWriteback) {
                    const appId = layout.qInfo?.qId?.split("_")[0] || "uJkrd";
                    const existingFeedback = await fetchExistingFeedback(appId);
                    const mergedData = mergeWithExistingFeedback(
                      qlikFormattedData,
                      existingFeedback
                    );
                    setTableData(mergedData);
                  } else {
                    setTableData(qlikFormattedData);
                  }
                } else {
                  console.warn(
                    "Could not fetch data for the current page, falling back to page 1"
                  );
                  const qlikFormattedData = processData({ layout });
                  setTableData(qlikFormattedData);
                  setCurrentPage(1);
                }
              } catch (error) {
                console.error("Error fetching page data:", error);
                const qlikFormattedData = processData({ layout });
                setTableData(qlikFormattedData);
                setCurrentPage(1);
              }
            }
          };
          processLayoutData();

          console.log(
            `Pagination setup complete: page ${pageToUse} of ${paginationInfo.totalPages}`
          );
        }
      }, [layout, totalRows, currentPage, userChangedPage]); // Added userChangedPage dependency
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
              const saveButtonContainer = document.createElement("div");
              saveButtonContainer.className = "save-button-container";

              const saveButton = document.createElement("button");
              saveButton.className = "save-all-button";
              saveButton.textContent = "Save All Changes";

              // Start with the button disabled (gray)
              saveButton.disabled = !hasUnsavedChanges;

              // Modified click handler to disable the button immediately after saving
              saveButton.addEventListener("click", () => {
                // Call saveAllChanges without disabling the button first
                saveAllChanges();
              });

              saveButtonContainer.appendChild(saveButton);
              paginationContainer.appendChild(saveButtonContainer);
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
