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

          // Fetch data for the new page
          const pageData = await fetchPageData(newPage);

          console.log(
            `Processing data for page ${newPage}, got ${pageData.length} rows`
          );

          // Process the new data
          const formattedData = processData({ layout, pageData });
          setTableData(formattedData);
          setCurrentPage(newPage);

          // Update pagination display
          const pageSize = getPageSize();
          const newPaginationInfo = calculatePaginationInfo(
            totalRows,
            pageSize,
            newPage
          );
          setPaginationInfo(newPaginationInfo);

          // Reset edited data for the new page
          setEditedData({});
          setSelectedRow(null);

          console.log(
            `Page change complete. Now on page ${newPage} of ${newPaginationInfo.totalPages}`
          );
        } catch (error) {
          console.error("Error changing page:", error);
        }
      };

      // Get initial data when layout changes
      useEffect(() => {
        console.log("index.js: Layout effect triggered", layout);

        if (layout && layout.qHyperCube) {
          console.log("index.js: Processing layout to format data");

          // Get total row count from the hypercube
          const totalRowCount = layout.qHyperCube.qSize.qcy;
          console.log(`Total rows in hypercube: ${totalRowCount}`);
          setTotalRows(totalRowCount);

          // Reset to page 1 when layout changes (e.g., selections, filtering)
          setCurrentPage(1);

          // Calculate pagination info
          const pageSize = getPageSize();
          const paginationInfo = calculatePaginationInfo(
            totalRowCount,
            pageSize,
            1
          );
          setPaginationInfo(paginationInfo);

          // Process data from the first page already in the layout
          const formattedData = processData({ layout });
          setTableData(formattedData);

          console.log(
            `Pagination initialized: ${paginationInfo.totalPages} pages of ${pageSize} rows each`
          );
        }
      }, [layout]);

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
                console.log(
                  `index.js: Creating writeback cell for ${header.id} at row ${rowIndex}`
                );

                // Create editable cell for writeback columns
                const input = document.createElement("input");
                input.type = "text";
                // Use edited value if it exists, otherwise use default
                input.value =
                  editedData[`${rowIndex}-${header.id}`] || cellData.value;

                // Handle changes to the input field
                input.addEventListener("change", (e) => {
                  console.log(
                    `index.js: Value changed for ${header.id} at row ${rowIndex}:`,
                    e.target.value
                  );

                  // Store the edited value in state
                  setEditedData((prev) => ({
                    ...prev,
                    [`${rowIndex}-${header.id}`]: e.target.value,
                  }));

                  // TODO: Implement actual writeback logic to Qlik or external storage
                  console.log(
                    `index.js: Writing back data: ${e.target.value} to row ${rowIndex}, field ${header.id}`
                  );
                });

                td.appendChild(input);
              } else {
                // Regular cell for dimensions and measures (non-editable)
                td.textContent = cellData.value;

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
                    // Immediate visual feedback - don't wait for state updates
                    const allRows = tbody.querySelectorAll("tr");
                    allRows.forEach((r) => r.classList.remove("selected-row"));
                    tr.classList.add("selected-row");

                    try {
                      // Store selected row for highlighting (async, but visuals already updated)
                      setSelectedRow(rowIndex);

                      // Start selection mode
                      if (!selections.isActive()) {
                        selections.begin("/qHyperCubeDef");
                      }

                      // Apply selection - this is the method that works
                      const globalRowIndex =
                        (currentPage - 1) * paginationInfo.pageSize + rowIndex;
                      const selectedRows = [globalRowIndex];

                      if (header.type === "dimension") {
                        try {
                          console.log(`Selecting row ${globalRowIndex}`);

                          // Use requestAnimationFrame to ensure visual update happens before selection processing
                          requestAnimationFrame(() => {
                            selections.select({
                              method: "selectHyperCubeCells",
                              params: ["/qHyperCubeDef", selectedRows, []],
                            });
                          });
                        } catch (selectionError) {
                          console.error("Selection error:", selectionError);
                        }
                      }
                    } catch (err) {
                      console.error("Error in selection handler:", err);
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

            // Add save changes button (for writeback)
          /*   if (layout.tableOptions?.allowWriteback) {
              const saveButtonContainer = document.createElement("div");
              saveButtonContainer.className = "save-button-container";

              const saveButton = document.createElement("button");
              saveButton.className = "save-button";
              saveButton.textContent = "Save All Changes";
              saveButton.addEventListener("click", () => {
                alert("Saving changes functionality would go here");
                // Here you would implement the actual save logic
                console.log("Saving changes:", editedData);
              });

              saveButtonContainer.appendChild(saveButton);
              paginationContainer.appendChild(saveButtonContainer);
            } */

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
              cursor: default;
              position: relative;
              font-weight: bold;
              position: sticky;
              top: 0;
              z-index: 10;
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
            
            .save-button-container {
              margin-left: auto;
            }
            
            .save-button {
              padding: 8px 16px;
              background-color: #4CAF50;
              color: white;
              border: none;
              border-radius: 3px;
              cursor: pointer;
              font-weight: bold;
              transition: background-color 0.2s ease;
            }
            
            .save-button:hover {
              background-color: #45a049;
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
      };
    },
  };
}
