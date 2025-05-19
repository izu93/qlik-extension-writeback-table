import {
  useElement,
  useLayout,
  useEffect,
  useState,
  useModel,
  useSelections,
} from "@nebula.js/stardust";
import properties from "./object-properties";
import data from "./data";
import ext from "./ext";

/**
 * Utility function to process Qlik hypercube data and transform it for the table
 * Takes the layout object from useLayout hook and extracts dimensions, measures,
 * and adds writeback columns
 */
function processData({ layout }) {
  console.log("processData: Processing layout data", layout);

  // Extract hypercube data from the layout (matrix of rows/columns)
  const qMatrix = layout.qHyperCube.qDataPages[0]
    ? layout.qHyperCube.qDataPages[0].qMatrix
    : [];
  console.log("processData: Extracted qMatrix", qMatrix);

  // Get metadata for dimensions and measures
  // Dimensions are categories/attributes, Measures are calculations/metrics
  const dimensions = layout.qHyperCube.qDimensionInfo || [];
  const measures = layout.qHyperCube.qMeasureInfo || [];
  console.log("processData: Dimensions and Measures", { dimensions, measures });

  // Create headers array for the table - combine dimensions, measures and writeback columns
  const headers = [
    // Convert Qlik dimensions to table headers with better labels
    ...dimensions.map((dim, dimIndex) => ({
      id: dim.qFallbackTitle,
      // Check for custom label in our extension properties first
      label:
        (layout.customLabels &&
          layout.customLabels.dimensions &&
          layout.customLabels.dimensions[dimIndex]) ||
        dim.qLabel ||
        dim.qLabelExpression ||
        dim.qFallbackTitle,
      type: "dimension",
      // Store more metadata for possible future use
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
    // Convert Qlik measures to table headers with better labels
    ...measures.map((meas, measIndex) => ({
      id: meas.qFallbackTitle,
      // Check for custom label in our extension properties first
      label:
        (layout.customLabels &&
          layout.customLabels.measures &&
          layout.customLabels.measures[measIndex]) ||
        meas.qLabel ||
        meas.qLabelExpression ||
        meas.qFallbackTitle,
      type: "measure",
      // Store more metadata for possible future use
      meta: {
        description: meas.qDesc,
        expression: meas.qDef,
        isCustomLabel: !!(
          layout.customLabels &&
          layout.customLabels.measures &&
          layout.customLabels.measures[measIndex]
        ),
        // Check if this measure is the current sort column
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

  // Transform the Qlik data matrix into row objects with properties for each column
  const rows = qMatrix.map((row, rowIndex) => {
    const formattedRow = {};

    // Process dimension values - these will be selectable in the UI
    dimensions.forEach((dim, dimIndex) => {
      formattedRow[dim.qFallbackTitle] = {
        value: row[dimIndex].qText, // Display text
        qElemNumber: row[dimIndex].qElemNumber, // Used for selections
        selectable: true, // Allow user to select this cell
      };
    });

    // Process measure values - these are typically not selectable
    measures.forEach((meas, measIndex) => {
      const dimCount = dimensions.length;
      formattedRow[meas.qFallbackTitle] = {
        value: row[dimCount + measIndex].qText, // Formatted text value
        qNum: row[dimCount + measIndex].qNum, // Numeric value
        selectable: false, // Measures aren't selectable in Qlik
      };
    });

    // Add empty writeback columns if enabled
    if (layout.tableOptions?.allowWriteback) {
      // Add empty writeback columns (status and comments) for user input
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
 * This is called by Qlik to initialize the extension
 * @param {object} galaxy - Contains environment information from Qlik
 */
export default function supernova(galaxy) {
  console.log(
    "index.js: Initializing writeback-table extension with galaxy",
    galaxy
  );

  return {
    // Define the extension's data requirements and properties
    qae: {
      properties, // Default and initial properties
      data, // Data target definitions (dimensions/measures)
    },
    ext: ext(galaxy), // Extension configuration and property panel

    /**
     * Component function that renders the visualization
     * This is called when the extension is added to a sheet
     */
    component() {
      console.log("index.js: Component function called");

      // Get the DOM element where we'll render the table
      const element = useElement();
      console.log("index.js: Got element", element);

      // Get the layout data from Qlik (contains hypercube, properties, etc.)
      const layout = useLayout();
      console.log("index.js: Got layout", layout);

      // Get the model for Qlik interactions (added for sorting functionality)
      const model = useModel();
      console.log("index.js: Got model", model);

      // Get selections for selection functionality
      const selections = useSelections();
      console.log("index.js: Got selections", selections);

      // State for the processed table data
      const [tableData, setTableData] = useState(null);
      // State to track user edits in writeback cells
      const [editedData, setEditedData] = useState({});
      // State to track selected row
      const [selectedRow, setSelectedRow] = useState(null);

      // Process the data when layout changes (selections, property changes, etc.)
      useEffect(() => {
        console.log("index.js: Layout effect triggered", layout);

        if (layout && layout.qHyperCube) {
          console.log("index.js: Processing layout to format data");
          const formattedData = processData({ layout });
          console.log("index.js: Formatted data", formattedData);
          setTableData(formattedData);
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

          // Create table DOM structure
          const table = document.createElement("table");
          table.className = "writeback-table";

          // ---- TABLE HEADER SECTION ----
          const thead = document.createElement("thead");
          const headerRow = document.createElement("tr");

          // Function to apply sorting
          const applySort = (headerObj, direction) => {
            if (headerObj.type === "dimension") {
              // Find the dimension index
              const dimensions = layout.qHyperCube.qDimensionInfo || [];
              const dimIndex = dimensions.findIndex(
                (d) => d.qFallbackTitle === headerObj.id
              );

              if (dimIndex !== -1) {
                try {
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

                  console.log(
                    `index.js: Applying ${direction} sort for dimension ${headerObj.id}`
                  );

                  // Use both applyPatches and beginSelections for better sorting
                  model.beginSelections(["/qHyperCubeDef"]);
                  model.applyPatches(
                    [
                      {
                        qPath: `/qHyperCubeDef/qDimensions/${dimIndex}/qDef/qSortCriterias/0`,
                        qOp: "replace",
                        qValue: JSON.stringify(sortCriteria),
                      },
                    ],
                    true
                  );
                  model.endSelections(true);
                } catch (err) {
                  console.error("Sorting error:", err);
                }
              }
            } else if (headerObj.type === "measure") {
              // For measures
              const dimensions = layout.qHyperCube.qDimensionInfo || [];
              const measures = layout.qHyperCube.qMeasureInfo || [];
              const measIndex = measures.findIndex(
                (m) => m.qFallbackTitle === headerObj.id
              );

              if (measIndex !== -1) {
                try {
                  // Calculate the sortIndex for this measure
                  const sortIndex = dimensions.length + measIndex;

                  console.log(
                    `index.js: Applying sort to measure ${headerObj.id} at index ${sortIndex}`
                  );

                  // Use beginSelections for better sorting
                  model.beginSelections(["/qHyperCubeDef"]);
                  model.applyPatches(
                    [
                      {
                        qPath: "/qHyperCubeDef/qInterColumnSortOrder",
                        qOp: "replace",
                        qValue: JSON.stringify([sortIndex]),
                      },
                    ],
                    true
                  );
                  model.endSelections(true);
                } catch (err) {
                  console.error("Sorting error:", err);
                }
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

          tableData.rows.forEach((row, rowIndex) => {
            console.log(`index.js: Creating row ${rowIndex}`);

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
                  console.log(
                    `index.js: Creating selectable cell for ${header.id} at row ${rowIndex}`
                  );

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
                      const selectedRows = [rowIndex];

                      if (header.type === "dimension") {
                        try {
                          console.log(`Selecting row ${rowIndex}`);

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

          table.appendChild(tbody);

          // Add the complete table to the DOM
          element.appendChild(table);
          console.log("index.js: Table added to DOM");

          // Add CSS styling for the table
          const style = document.createElement("style");
          style.textContent = `
            /* Base table styling */
            .writeback-table {
              width: 100%;
              border-collapse: collapse;
              font-family: Arial, sans-serif;
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
          `;

          element.appendChild(style);
          console.log("index.js: Styles added to DOM");
        } catch (err) {
          console.error("Error rendering table:", err);
          element.innerHTML = `<div style="color: red; padding: 20px;">
            <p>Error rendering table: ${err.message}</p>
          </div>`;
        }
      }, [tableData, editedData, layout, model, selectedRow]);

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
