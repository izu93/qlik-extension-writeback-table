// index.js - Main entry point for the Qlik writeback extension
/**
 * Modular Qlik Writeback Table Extension
 * Main coordinator that imports and orchestrates all modules
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
//import tableStyles from "./styles/table.css?inline";

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
} from "./utils/constants.js";

// Import UI components
import { TableRenderer } from "./ui/tableRenderer.js";
import { PaginationRenderer } from "./ui/paginationRenderer.js";
import { MessageRenderer } from "./ui/messageRenderer.js";

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
      const handleCellEdit = (accountId, fieldId, value) => {
        console.log(`Cell edited: ${accountId} - ${fieldId} = ${value}`);

        const dataKey = generateDataKey(accountId, fieldId);
        setEditedData((prev) => ({
          ...prev,
          [dataKey]: value,
        }));

        setHasUnsavedChanges(true);

        // Save to localStorage
        try {
          const dataToSave = {
            changes: { ...editedData, [dataKey]: value },
            timestamp: new Date().toISOString(),
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

      const handleSort = (headerInfo, direction) => {
        console.log(`Sort requested: ${headerInfo.id} - ${direction}`);
        // Sorting logic would be implemented here
        // This would use the existing sorting logic from the original code
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
      // Updated processLayoutData function inside the main layout effect
      async function processLayoutData() {
        console.log("=== Starting layout data processing ===");

        let qlikFormattedData;
        const currentPage = paginationManager.currentPage;

        // Get Qlik data
        if (shouldReset || currentPage === 1) {
          qlikFormattedData = processData({ layout });
        } else {
          try {
            const pageData = await paginationManager.fetchPageData(currentPage);
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

        // ALWAYS fetch and merge writeback data (not just on save)
        await mergeWritebackDataFromDB(qlikFormattedData);
      }

      // Updated mergeWritebackDataFromDB function
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

            // DEBUG: Log sample merged data
            const sampleMerged = mergedRows.find(
              (row) =>
                (row.status?.value && row.status.value !== "") ||
                (row.comments?.value && row.comments.value !== "")
            );
            if (sampleMerged) {
              console.log("Sample merged row with writeback data:", {
                accountId: sampleMerged.AccountID?.value,
                status: sampleMerged.status?.value,
                comments: sampleMerged.comments?.value,
              });
            }
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

      const handleSaveChanges = async () => {
        if (isSaving || !hasUnsavedChanges) {
          console.log("Save ignored - either already saving or no changes");
          return;
        }

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
            onSort: handleSort,
          })
      );

      const [paginationRenderer] = useState(
        () =>
          new PaginationRenderer({
            onPageChange: handlePageChange,
          })
      );

      const [messageRenderer] = useState(() => new MessageRenderer());

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

        // Reset selected row when leaving selection mode
        if (!selections.isActive() && selectedRow !== null) {
          setSelectedRow(null);
        }
      }, [layout.qSelectionInfo, wasInSelectionMode, selections.isActive()]);

      // Auto-refresh effect for writeback data
      useEffect(() => {
        if (!tableData?.rows?.length) return;

        const timer = setInterval(async () => {
          console.log("Auto-refresh: Fetching latest writeback data...");
          const appId = getConsistentAppId(model);

          try {
            const latestWritebacks = await fetchLatestWritebacks(appId);
            if (latestWritebacks?.length > 0) {
              setTableData((prevData) => {
                if (!prevData?.rows) return prevData;
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
        }, ENV.AUTO_REFRESH_INTERVAL);

        return () => clearInterval(timer);
      }, [model?.id]);

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

          // Skip rendering in selection mode to avoid visual glitches
          if (layout.qSelectionInfo?.qInSelections) {
            console.log("index.js: In selection mode, skipping render");
            return;
          }

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

          // Render pagination if enabled
          const paginationEnabled = layout.paginationOptions?.enabled !== false;
          const pageInfo = paginationManager.getCurrentPageInfo();

          if (paginationEnabled && pageInfo.totalPages > 1) {
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

        try {
          console.log("Loading CSS from styles/table.css...");

          // Try to fetch the CSS file dynamically
          const response = await fetch("./styles/table.css");

          if (response.ok) {
            const cssText = await response.text();

            // Create and inject the style element
            const style = document.createElement("style");
            style.id = "writeback-table-styles";
            style.textContent = cssText;
            document.head.appendChild(style);

            console.log("CSS loaded successfully from styles/table.css");
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (error) {
          console.warn(
            "Could not load CSS file, using fallback styles:",
            error
          );

          // Fallback to comprehensive inline styles
          const style = document.createElement("style");
          style.id = "writeback-table-styles";
          style.textContent = `
      /* Comprehensive fallback styles for writeback table */
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
      
      .table-scroll-wrapper {
        flex: 1;
        overflow-y: auto;
        overflow-x: auto;
        min-height: 100px;
        max-height: calc(100% - 50px);
      }
      
      .writeback-table {
        width: 100%;
        border-collapse: collapse;
      }
      
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
      
      .writeback-table td:first-child,
      .writeback-table th:first-child {
         border-left: 1px solid #ddd;
      }
      
      .writeback-table th.sortable {
        cursor: pointer;
        padding-right: 32px;
      }
      
      .sort-icon-container {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      
      .sort-icon {
        font-size: 10px;
        color: #aaa;
        cursor: pointer;
        margin: -2px 0;
      }
      
      .sort-icon.active {
        color: #333;
      }
      
      .sort-icon:hover {
        color: #666;
      }
      
      .writeback-table td {
        padding: 8px;
        border-bottom: 1px solid #ddd;
        border-right: 1px solid #ddd; 
        transition: background-color 0.15s ease;
      }
      
      .writeback-table tr.alternate {
        background-color: #f9f9f9;
      }
      
      .writeback-table td.selectable {
        cursor: pointer;
      }
      
      .writeback-table td.selectable:hover {
        background-color: #f5f5f5;
      }
      
      .writeback-table tr.selected-row td {
        background-color: #e6ffe6 !important;
        border-bottom: 1px solid #b3ffb3;
        font-weight: bold;
        transition: all 0.15s ease;
      }
      
      .writeback-table input {
        width: 100%;
        padding: 6px;
        box-sizing: border-box;
        border: 1px solid #ddd;
      }
      
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
      
      .pagination-container {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px;
        background-color: #f8f8f8;
        border-top: 1px solid #ddd;
        min-height: 40px;
        flex-shrink: 0;
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
        background-color: orange;
        cursor: wait;
      }

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

      .save-message.error {
        background-color: #f44336;
      }

      .save-message.warning {
        background-color: #ff9800;
      }

      .save-message.info {
        background-color: #2196F3;
      }

      @keyframes fadeInOut {
        0% { opacity: 0; transform: translateY(20px); }
        10% { opacity: 1; transform: translateY(0); }
        90% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(20px); }
      }

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

      .thumbs-up-icon {
        color: #4CAF50;
      }

      .thumbs-down-icon {
        color: #f44336;
      }

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
          document.head.appendChild(style);

          console.log("Fallback styles applied successfully");
        }
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
