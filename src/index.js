// index.js - Main entry point for the Qlik writeback extension
/**
 * Modular Qlik Writeback Table Extension
 * Main coordinator that imports and orchestrates all modules
 * UPDATED: Uses customer_name instead of account_id
 */

// Import Qlik hooks
import {
  useElement,
  useLayout,
  useEffect,
  useState,
  useModel,
  useSelections,
  useConstraints,
} from "@nebula.js/stardust";

// Import configuration
import ENV from "./config/env.js";
import properties from "./object-properties";
import data from "./data";
import ext from "./ext";

// Import core modules
import { processData, generateDataKey } from "./core/dataProcessor.js";
import { PaginationManager } from "./core/paginationManager.js";

// Import backend services
import { fetchLatestWritebacks } from "./backend/dataService.js";
import { mergeWritebackData } from "./backend/mergeService.js";
import { saveAllChanges } from "./backend/writebackService.js";

// Import utilities
import { getOrPromptUsername, getConsistentAppId } from "./utils/userUtils.js";
import {
  CSS_CLASSES,
  MESSAGE_TYPES,
  WRITEBACK_COLUMNS,
  COLUMN_TYPES,
} from "./utils/constants.js";

// Import UI components
import { TableRenderer } from "./ui/tableRenderer.js";
import { PaginationRenderer } from "./ui/paginationRenderer.js";
import { MessageRenderer } from "./ui/messageRenderer.js";
import { NotificationManager } from "./ui/notificationManager.js";

/**
 * Main extension entry point - the supernova function
 */
export default function supernova(galaxy) {
  console.log(
    "index.js: Initializing modular writeback-table extension with galaxy",
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

      // Get Qlik hooks
      const element = useElement();
      const layout = useLayout();
      const model = useModel();
      const selections = useSelections();
      const constraints = useConstraints();

      // State management
      const [tableData, setTableData] = useState(null);
      const [editedData, setEditedData] = useState({});
      const [selectedRow, setSelectedRow] = useState(null);
      const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
      const [isSaving, setIsSaving] = useState(false);
      const [isLoading, setIsLoading] = useState(false);
      const [lastLayoutId, setLastLayoutId] = useState("");
      const [wasInSelectionMode, setWasInSelectionMode] = useState(false);
      const [isPageNavigation, setIsPageNavigation] = useState(false);

      // DEFINE EVENT HANDLERS FIRST - Before they're used in useState
      const handleCellEdit = (customerName, fieldId, value) => {
        console.log(`Cell edited: ${customerName} - ${fieldId} = ${value}`);

        // NEW: Track edit start
        notificationManager.trackEditStart(customerName, fieldId);

        const dataKey = generateDataKey(customerName, fieldId);
        setEditedData((prev) => ({
          ...prev,
          [dataKey]: value,
        }));

        setHasUnsavedChanges(true);

        // Save to localStorage (existing code, but add user info)
        try {
          const dataToSave = {
            changes: { ...editedData, [dataKey]: value },
            timestamp: new Date().toISOString(),
            user: notificationManager.currentUser, // NEW
          };
          localStorage.setItem(
            ENV.STORAGE_KEYS.EDITED_DATA,
            JSON.stringify(dataToSave)
          );
        } catch (err) {
          console.error("Error saving to localStorage:", err);
        }
      };

      const handleRowSelect = (rowIndex, cellData, headerInfo) => {
        console.log(`Row selected: ${rowIndex}`);
        setSelectedRow(rowIndex);

        // Handle Qlik selections if enabled
        if (cellData.selectable && layout.tableOptions?.allowSelections) {
          handleQlikSelection(rowIndex, cellData, headerInfo);
        }
      };

      const handleQlikSelection = (rowIndex, cellData, headerInfo) => {
        try {
          if (!selections.isActive()) {
            console.log(
              `Starting selection for ${headerInfo.id}, elem: ${cellData.qElemNumber}`
            );

            selections.begin("/qHyperCubeDef");

            // Find dimension index
            const dimensions = layout.qHyperCube.qDimensionInfo || [];
            let dimIndex = -1;

            for (let i = 0; i < dimensions.length; i++) {
              if (dimensions[i].qFallbackTitle === headerInfo.id) {
                dimIndex = i;
                break;
              }
            }

            if (dimIndex !== -1) {
              console.log(
                `Found dimension at index ${dimIndex}, selecting element ${cellData.qElemNumber}`
              );

              const pageInfo = paginationManager.getCurrentPageInfo();
              selections.select({
                method: "selectHyperCubeCells",
                params: [
                  "/qHyperCubeDef",
                  [(pageInfo.currentPage - 1) * pageInfo.pageSize + rowIndex],
                  [dimIndex],
                ],
              });
            }
          }
        } catch (err) {
          console.error("Error in selection handler:", err);
          if (selections.isActive()) {
            selections.cancel();
          }
        }
      };

      const handleSort = async (headerInfo, direction) => {
        console.log(`Sort requested: ${headerInfo.id} - ${direction}`);

        // ONLY allow sorting on Amount column
        if (headerInfo.id !== "Amount" && headerInfo.label !== "Amount") {
          console.log("Sorting only available for Amount column");
          return;
        }

        try {
          setIsLoading(true);

          const dimensions = layout.qHyperCube.qDimensionInfo || [];
          const measures = layout.qHyperCube.qMeasureInfo || [];

          let sortColumnIndex = -1;
          let sortType = "";

          // Check if Amount is a measure
          const measIndex = measures.findIndex(
            (meas) => meas.qFallbackTitle === "Amount"
          );
          if (measIndex !== -1) {
            sortColumnIndex = measIndex;
            sortType = "measure";
          } else {
            // Check if Amount is a dimension (unlikely but just in case)
            const dimIndex = dimensions.findIndex(
              (dim) => dim.qFallbackTitle === "Amount"
            );
            if (dimIndex !== -1) {
              sortColumnIndex = dimIndex;
              sortType = "dimension";
            }
          }

          if (sortColumnIndex === -1) {
            console.log("Amount column not found for sorting");
            console.log(
              "Available measures:",
              measures.map((m) => m.qFallbackTitle)
            );
            console.log(
              "Available dimensions:",
              dimensions.map((d) => d.qFallbackTitle)
            );
            setIsLoading(false);
            return;
          }

          console.log(
            `Sorting Amount (${sortType}) at index ${sortColumnIndex} in direction ${direction}`
          );

          // Create sort direction for Qlik (1 = ascending, -1 = descending)
          const sortDirection = direction === "asc" ? 1 : -1;

          let patches = [];

          if (sortType === "measure") {
            // Sort Amount measure numerically
            patches = [
              {
                qPath: `/qHyperCubeDef/qMeasures/${sortColumnIndex}/qSortBy/qSortByNumeric`,
                qOp: "replace",
                qValue: `${sortDirection}`,
              },
            ];
          } else {
            // Sort Amount dimension numerically (if it's a dimension)
            patches = [
              {
                qPath: `/qHyperCubeDef/qDimensions/${sortColumnIndex}/qDef/qSortCriterias/0/qSortByNumeric`,
                qOp: "replace",
                qValue: `${sortDirection}`,
              },
            ];
          }

          console.log("Applying Amount sort patches:", patches);

          // Apply sort patches to the model - this sorts the ENTIRE dataset
          await model.applyPatches(patches);

          console.log(
            `Amount sort applied successfully in ${direction} direction`
          );

          // Reset to page 1 after sorting to see the sorted results
          paginationManager.reset();

          // The layout effect will automatically trigger and re-render with the entire sorted dataset
        } catch (error) {
          console.error("Error sorting Amount:", error);
          messageRenderer.showMessage(
            `Error sorting by Amount: ${error.message}`,
            MESSAGE_TYPES.ERROR,
            element
          );
        } finally {
          setIsLoading(false);
        }
      };

      // Replace your handlePageChange with this optimized version:

      const handlePageChange = async (newPage) => {
        console.log(`Page change requested: ${newPage}`);
        setIsLoading(true);
        setIsPageNavigation(true);

        try {
          const pageData = await paginationManager.changePage(
            newPage,
            async ({ pageData, paginationInfo }) => {
              console.log(`Processing page ${newPage} data...`);

              // INSTANT: Show Qlik data immediately (no waiting!)
              const qlikFormattedData = processData({ layout, pageData });
              setTableData(qlikFormattedData);
              setIsLoading(false); // Remove loading spinner immediately

              console.log(
                "Instant render complete, merging writeback data in background..."
              );

              // BACKGROUND: Merge writeback data without blocking UI
              setTimeout(async () => {
                const appId = getConsistentAppId(model);

                try {
                  const latestWritebacks = await fetchLatestWritebacks(appId);
                  console.log(
                    "Background fetched",
                    latestWritebacks?.length || 0,
                    "records"
                  );

                  if (latestWritebacks && latestWritebacks.length > 0) {
                    const finalRows = mergeWritebackData(
                      qlikFormattedData.rows,
                      latestWritebacks
                    );
                    console.log("Background merge complete, updating UI...");

                    // Smooth update with merged data
                    setTableData({ ...qlikFormattedData, rows: finalRows });
                  }
                } catch (mergeError) {
                  console.error("Background merge error:", mergeError);
                }
              }, 50); // Tiny delay to ensure UI renders first

              setSelectedRow(null);
              console.log(`Page ${newPage} instantly loaded`);
            }
          );
        } catch (error) {
          console.error("Error in page change:", error);
          setIsLoading(false);
        } finally {
          setIsPageNavigation(false);
        }
      };

      // Add this to prevent rapid clicking
      let saveInProgress = false;
      const handleSaveChanges = async () => {
        if (isSaving || !hasUnsavedChanges) {
          console.log("Save ignored - either already saving or no changes");
          return;
        }
        saveInProgress = true;
        console.log("Save button clicked, starting save process");
        setIsSaving(true);
        messageRenderer.showMessage(
          "Saving to database...",
          MESSAGE_TYPES.INFO,
          element
        );

        try {
          const result = await saveAllChanges({
            editedData,
            tableData,
            currentPage: paginationManager.currentPage,
            model,
            galaxy,
          });

          if (result.success) {
            // NEW: Show success with user info
            notificationManager.showSaveSuccess(
              result.successCount,
              result.totalCount
            );
            // 1. Clear local state first
            setEditedData({});
            setHasUnsavedChanges(false);
            localStorage.removeItem(ENV.STORAGE_KEYS.EDITED_DATA);

            messageRenderer.showMessage(
              result.message,
              MESSAGE_TYPES.SUCCESS,
              element
            );

            // 2. Force refresh with delay to ensure DB consistency
            console.log("Forcing data refresh after successful save...");

            setTimeout(async () => {
              try {
                const appId = getConsistentAppId(model);
                console.log("Fetching latest data for refresh...");

                const latestWritebacks = await fetchLatestWritebacks(appId);
                console.log("Fetched writeback data:", latestWritebacks);

                if (latestWritebacks?.length > 0) {
                  setTableData((prevData) => {
                    if (!prevData?.rows) return prevData;

                    console.log("Starting merge for refresh...");
                    const mergedRows = mergeWritebackData(
                      prevData.rows,
                      latestWritebacks
                    );

                    console.log("Merge complete - updating table data");
                    console.log("Merged rows sample:", mergedRows.slice(0, 2));

                    return { ...prevData, rows: mergedRows };
                  });

                  // 3. Force a re-render after state update
                  setTimeout(() => {
                    console.log("Triggering table re-render...");
                    // This will trigger the renderTable useEffect
                  }, 100);
                } else {
                  console.warn("No writeback data received during refresh");
                }
              } catch (refreshError) {
                console.error("Error during post-save refresh:", refreshError);
              }
            }, 1000); // Wait 1 second for DB consistency
          } else {
            messageRenderer.showMessage(result.message, result.type, element);
          }
        } catch (error) {
          console.error("Error saving changes:", error);
          messageRenderer.showMessage(
            `Error saving: ${error.message}`,
            MESSAGE_TYPES.ERROR,
            element
          );
        } finally {
          saveInProgress = false;
          setIsSaving(false);
        }
      };

      // NOW Initialize managers with the handlers (they're defined now)
      // Initialize pagination manager
      const [paginationManager] = useState(() => new PaginationManager(model));

      // Initialize UI renderers
      const [tableRenderer] = useState(
        () =>
          new TableRenderer({
            onCellEdit: handleCellEdit,
            onRowSelect: handleRowSelect,
            onSort: handleSort, // Re-enabled sorting
          })
      );

      const [paginationRenderer] = useState(
        () =>
          new PaginationRenderer({
            onPageChange: handlePageChange,
          })
      );

      const [messageRenderer] = useState(() => new MessageRenderer());

      const [notificationManager] = useState(
        () => new NotificationManager(messageRenderer)
      );

      // Load saved data from localStorage on mount
      useEffect(() => {
        try {
          const savedDataStr = localStorage.getItem(
            ENV.STORAGE_KEYS.EDITED_DATA
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

      // Main layout effect - processes data when layout changes
      // Main layout effect - processes data when layout changes
      useEffect(() => {
        if (!layout || !layout.qHyperCube) return;

        const layoutId = layout.qInfo?.qId || "";
        console.log(
          `Layout effect triggered. Layout ID: ${layoutId}, Previous: ${lastLayoutId}`
        );
        console.log("Is page navigation:", isPageNavigation);

        // Skip processing if this is just a page navigation
        if (isPageNavigation) {
          console.log(
            "⏭Skipping layout processing - page navigation in progress"
          );
          return;
        }
        // Initialize pagination with layout data
        paginationManager.initialize(layout);
        const pageInfo = paginationManager.getCurrentPageInfo();

        // Check if we should reset to page one
        const shouldReset = paginationManager.shouldResetToPageOne(
          layout,
          layoutId,
          lastLayoutId
        );

        if (shouldReset) {
          console.log("Resetting to page 1 due to data change");
          paginationManager.reset();
        }

        // Update layout ID
        if (layoutId !== lastLayoutId) {
          setLastLayoutId(layoutId);
        }

        // Process layout data
        processLayoutData();

        async function processLayoutData() {
          console.log("=== Starting layout data processing ===");

          let qlikFormattedData;
          const currentPage = paginationManager.currentPage;

          // Get Qlik data
          if (shouldReset || currentPage === 1) {
            qlikFormattedData = processData({ layout });
          } else {
            try {
              const pageData = await paginationManager.fetchPageData(
                currentPage
              );
              if (pageData && pageData.length > 0) {
                qlikFormattedData = processData({ layout, pageData });
              } else {
                qlikFormattedData = processData({ layout });
                paginationManager.reset();
              }
            } catch (error) {
              console.error("Error fetching page data:", error);
              qlikFormattedData = processData({ layout });
              paginationManager.reset();
            }
          }

          // Fetch and merge writeback data
          await mergeWritebackDataFromDB(qlikFormattedData);
        }

        async function mergeWritebackDataFromDB(qlikData) {
          console.log("=== Starting DB data fetch and merge ===");
          const appId = getConsistentAppId(model);
          console.log("Using app_id for fetch:", appId);

          let mergedRows = qlikData.rows;

          try {
            const latestWritebacks = await fetchLatestWritebacks(appId);
            console.log("Raw fetched writeback data:", latestWritebacks);

            if (latestWritebacks && latestWritebacks.length > 0) {
              console.log(
                "Processing",
                latestWritebacks.length,
                "writeback records"
              );
              mergedRows = mergeWritebackData(qlikData.rows, latestWritebacks);
              console.log(
                "Successfully merged writeback data into",
                mergedRows.length,
                "table rows"
              );
            } else {
              console.log("No writeback data found - using original Qlik data");
            }
          } catch (err) {
            console.error("Error fetching/merging DB writeback data:", err);
            console.log("Falling back to original Qlik data without merge");
          }

          // Set the final table data
          setTableData({ ...qlikData, rows: mergedRows });
          console.log("=== Table data updated with merge complete ===");
        }
      }, [layout, lastLayoutId, paginationManager.userChangedPage]);

      // Selection state tracking effect
      useEffect(() => {
        const isInSelectionMode = !!layout.qSelectionInfo?.qInSelections;

        console.log(
          `Selection state changed: was ${wasInSelectionMode}, is now ${isInSelectionMode}`
        );

        // If exiting selection mode, prevent page reset
        if (wasInSelectionMode && !isInSelectionMode) {
          console.log(
            "SELECTION CANCELLED - Setting user changed page to true to prevent reset"
          );
          paginationManager.setUserChangedPage(true);
        }

        setWasInSelectionMode(isInSelectionMode);

        // DON'T reset selected row when leaving selection mode - keep it for visual feedback
        // if (!selections.isActive() && selectedRow !== null) {
        //   setSelectedRow(null);
        // }
      }, [layout.qSelectionInfo, wasInSelectionMode, selections.isActive()]);

      // Auto-refresh effect for writeback data
      useEffect(() => {
        console.log("🔍 Auto-refresh useEffect triggered");
        console.log("🔍 Table data exists:", !!tableData?.rows?.length);
        console.log("🔍 ENV.AUTO_REFRESH_INTERVAL:", ENV.AUTO_REFRESH_INTERVAL);

        if (!tableData?.rows?.length) {
          console.log("Auto-refresh: No table data, skipping setup");
          return;
        }

        console.log(
          "Auto-refresh: Setting up timer for",
          ENV.AUTO_REFRESH_INTERVAL,
          "ms"
        );

        const timer = setInterval(async () => {
          console.log("Auto-refresh: Timer triggered, fetching latest data...");
          const appId = getConsistentAppId(model);

          try {
            const latestWritebacks = await fetchLatestWritebacks(appId);
            console.log(
              "Auto-refresh: Received",
              latestWritebacks?.length || 0,
              "records"
            );

            if (latestWritebacks?.length > 0) {
              setTableData((prevData) => {
                if (!prevData?.rows) return prevData;
                const mergedRows = mergeWritebackData(
                  prevData.rows,
                  latestWritebacks
                );
                console.log(
                  "Auto-refresh: Updated table with",
                  mergedRows.length,
                  "rows"
                );
                return { ...prevData, rows: mergedRows };
              });
            }
          } catch (err) {
            console.warn("Auto-refresh failed:", err);
          }
        }, ENV.AUTO_REFRESH_INTERVAL);

        return () => {
          console.log("Auto-refresh: Cleaning up timer");
          clearInterval(timer);
        };
      }, [tableData?.rows?.length, model?.id]); //  Now waits for table data

      // Main render effect
      useEffect(() => {
        renderTable();
      }, [
        tableData,
        editedData,
        selectedRow,
        isLoading,
        hasUnsavedChanges,
        isSaving,
      ]);
      // notification manager effect
      useEffect(() => {
        async function initializeNotifications() {
          const username = await getOrPromptUsername(galaxy);
          notificationManager.initialize(username);
          notificationManager.startMonitoring();
        }

        initializeNotifications();

        return () => {
          notificationManager.destroy();
        };
      }, []);
      // Main render function
      async function renderTable() {
        try {
          console.log("index.js: Starting table render");

          if (!tableData) {
            element.innerHTML = `
              <div style="padding: 20px; text-align: center;">
                <p>Add dimensions and measures to see data</p>
              </div>
            `;
            return;
          }

          // REMOVED: Skip rendering in selection mode - allow rendering always
          // This ensures save button stays visible during selections

          // Clear and create container
          element.innerHTML = "";
          const container = document.createElement("div");
          container.className = CSS_CLASSES.CONTAINER;
          element.appendChild(container);

          // Render table
          tableRenderer.render({
            container,
            tableData,
            editedData,
            selectedRow,
            layout,
            currentPage: paginationManager.currentPage,
          });

          // Render pagination if enabled - ALWAYS render if writeback is enabled
          const paginationEnabled = layout.paginationOptions?.enabled !== false;
          const pageInfo = paginationManager.getCurrentPageInfo();
          const hasWriteback = layout.tableOptions?.allowWriteback;

          // Show pagination if enabled OR if writeback is enabled (for save button)
          if ((paginationEnabled && pageInfo.totalPages > 1) || hasWriteback) {
            paginationRenderer.render({
              container,
              pageInfo,
              layout,
              hasUnsavedChanges,
              isSaving,
              onSave: handleSaveChanges,
            });
          }

          // Add loading overlay
          const loadingOverlay = document.createElement("div");
          loadingOverlay.className =
            "loading-overlay" + (isLoading ? " active" : "");
          loadingOverlay.innerHTML = `
            <div class="spinner"></div>
            <div class="loading-text">Loading data...</div>
          `;
          container.appendChild(loadingOverlay);

          // Add CSS
          if (!document.querySelector("#writeback-table-styles")) {
            await addStyles();
          }

          console.log("index.js: Render complete");
        } catch (err) {
          console.error("Error rendering table:", err);
          element.innerHTML = `<div style="color: red; padding: 20px;">
            <p>Error rendering table: ${err.message}</p>
          </div>`;
        }
      }

      async function addStyles() {
        // Check if styles already exist
        if (document.querySelector("#writeback-table-styles")) {
          console.log("Styles already loaded");
          return;
        }

        console.log("Loading inline CSS styles...");

        // Use inline styles instead of fetching external file
        const style = document.createElement("style");
        style.id = "writeback-table-styles";
        style.textContent = `
    /* Comprehensive styles for writeback table */
    .writeback-table-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      border: 1px solid #ddd;
      font-family: Arial, sans-serif;
      background: white;
    }
    
    .table-scroll-wrapper {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      min-height: 200px;
      max-height: calc(100% - 60px);
    }
    
    .writeback-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    
    .writeback-table th {
      background-color: #f8f9fa;
      padding: 12px 8px;
      text-align: left;
      border-bottom: 2px solid #dee2e6;
      border-right: 1px solid #dee2e6;
      font-weight: 600;
      color: #495057;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .writeback-table td {
      padding: 8px;
      border-bottom: 1px solid #dee2e6;
      border-right: 1px solid #dee2e6;
      vertical-align: middle;
    }
    
    .writeback-table td:first-child,
    .writeback-table th:first-child {
       border-left: 1px solid #dee2e6;
    }
    
    .writeback-table tr:nth-child(even) {
      background-color: #f8f9fa;
    }
    
    .writeback-table tr:hover {
      background-color: #e9ecef;
    }

    /* Row hover effects */
    .writeback-table tbody tr {
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .writeback-table tbody tr:hover {
      background-color: #e9ecef !important;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    /* Individual cell hover for better precision */
    .writeback-table tbody td {
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .writeback-table tbody td:hover {
      background-color: #dee2e6;
    }

    /* Special hover for selectable cells (dimensions) */
    .writeback-table td.selectable:hover {
      background-color: #cce5ff !important;
      border-left: 3px solid #007bff;
    }

    /* Don't change cursor for input fields */
    .writeback-table input,
    .writeback-table select {
      cursor: text;
    }

    .writeback-table select {
      cursor: pointer;
    }

    /* Enhance selected row appearance */
    .writeback-table tr.selected-row {
      background-color: #d4edda !important;
      border-left: 4px solid #28a745;
    }

    .writeback-table tr.selected-row:hover {
      background-color: #c3e6cb !important;
    }
    
    /* Status dropdown styling */
    .status-select-container {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 4px;
      background-color: #f8f9fa;
      min-height: 32px;
    }
    
    .status-green {
      background-color: #d4edda;
      border: 1px solid #c3e6cb;
    }
    
    .status-red {
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
    }
    
    .status-icon {
      margin-right: 8px;
      font-size: 16px;
    }
    
    .status-select {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #ced4da;
      border-radius: 3px;
      background-color: white;
      font-size: 14px;
    }
    
    .status-select:focus {
      outline: none;
      border-color: #80bdff;
      box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
    }
    
    /* Comments input styling */
    .comments-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ced4da;
      border-radius: 3px;
      font-size: 14px;
      min-height: 32px;
      box-sizing: border-box;
    }
    
    .comments-input:focus {
      outline: none;
      border-color: #80bdff;
      box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
    }
    
    /* Risk progress bar styling */
    .risk-bar-container {
      position: relative;
      width: 100%;
      height: 24px;
      background-color: #e9ecef;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      align-items: center;
    }

    .risk-progress-bar {
      height: 100%;
      border-radius: 12px;
      transition: width 0.3s ease;
      min-width: 20px; /* Ensure some visibility even for small values */
    }

    .risk-value-text {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      font-weight: 600;
      font-size: 12px;
      color: #212529;
      z-index: 2;
      text-shadow: 0 0 3px rgba(255,255,255,0.8);
    }

    /* Risk level colors */
    .risk-very-low {
      background: linear-gradient(90deg, #28a745, #20c997);
    }

    .risk-low {
      background: linear-gradient(90deg, #ffc107, #fd7e14);
    }

    .risk-medium {
      background: linear-gradient(90deg, #fd7e14, #dc3545);
    }

    .risk-high {
      background: linear-gradient(90deg, #dc3545, #6f42c1);
    }
    
    /* Pagination styling */
    .pagination-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background-color: #f8f9fa;
      border-top: 1px solid #dee2e6;
      min-height: 50px;
      flex-shrink: 0;
    }
    
    .rows-info {
      color: #6c757d;
      font-size: 14px;
      font-weight: 500;
    }
    
    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .pagination-button {
      padding: 8px 16px;
      background-color: #fff;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #495057;
      transition: all 0.2s ease;
    }
    
    .pagination-button:hover:not(.disabled) {
      background-color: #e9ecef;
      border-color: #adb5bd;
    }
    
    .pagination-button.disabled {
      opacity: 0.6;
      cursor: not-allowed;
      background-color: #f8f9fa;
    }
    
    .page-number-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .page-input {
      width: 60px;
      padding: 8px;
      text-align: center;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .page-total {
      color: #6c757d;
      font-size: 14px;
    }
    
    /* Save button styling */
    .save-all-button {
      padding: 10px 20px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
      transition: background-color 0.2s ease;
    }

    .save-all-button:hover:not(:disabled) {
      background-color: #0056b3;
    }

    .save-all-button:disabled {
      background-color: #6c757d;
      cursor: not-allowed;
    }

    .save-all-button.saving {
      background-color: #fd7e14;
      cursor: wait;
    }

    /* Message styling */
    .save-message {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #28a745;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      animation: fadeInOut 3s ease-in-out;
      max-width: 400px;
    }

    .save-message.error {
      background-color: #dc3545;
    }

    .save-message.warning {
      background-color: #ffc107;
      color: #212529;
    }

    .save-message.info {
      background-color: #17a2b8;
    }

    @keyframes fadeInOut {
      0% { opacity: 0; transform: translateY(20px); }
      10% { opacity: 1; transform: translateY(0); }
      90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(20px); }
    }

    /* Loading overlay */
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.8);
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
      border-top: 4px solid #007bff;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
    }
    
    .loading-text {
      margin-top: 12px;
      font-weight: 600;
      color: #495057;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Icons */
    .thumbs-up-icon {
      color: #28a745;
    }

    .thumbs-down-icon {
      color: #dc3545;
    }

    /* Responsive design */
    @media (max-width: 768px) {
      .pagination-container {
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
      }
      
      .pagination-controls {
        justify-content: center;
      }
    }

    /* Sort CSS */
    .sortable {
      cursor: pointer;
      position: relative;
      padding-right: 40px !important;
      user-select: none; /* Prevent text selection when clicking */
    }

    .sortable:hover {
      background-color: #e9ecef;
    }

    .sort-icon-container {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .sort-icon {
      font-size: 11px;
      color: #6c757d;
      cursor: pointer;
      transition: all 0.2s ease;
      line-height: 1;
      padding: 2px;
      border-radius: 2px;
      font-weight: bold;
    }

    .sort-icon:hover {
      color: #007bff;
      background-color: rgba(0, 123, 255, 0.1);
      transform: scale(1.1);
    }

    .sort-icon.active {
      color: #007bff;
      background-color: rgba(0, 123, 255, 0.2);
      box-shadow: 0 0 0 1px #007bff;
    }

    .sort-icon.asc-icon:hover {
      color: #28a745; /* Green for ascending */
    }

    .sort-icon.desc-icon:hover {
      color: #dc3545; /* Red for descending */
    }

    /* Add some visual feedback for the header itself */
    .sortable:hover .sort-icon-container {
      opacity: 1;
    }

    .sort-icon-container {
      opacity: 0.7;
      transition: opacity 0.2s ease;
    }
  `;

        document.head.appendChild(style);
        console.log("Inline CSS styles applied successfully");
      }
      // Cleanup function
      return () => {
        console.log("index.js: Component cleanup");
        element.innerHTML = "";
        paginationManager.destroy();
      };
    },
  };
}
