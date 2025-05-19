import {
  useElement,
  useLayout,
  useEffect,
  useState,
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
      },
    })),
    // Add custom writeback columns that aren't part of the Qlik data model
    {
      id: "status",
      label: layout.columnLabels?.status || "Status",
      type: "writeback",
    },
    {
      id: "comments",
      label: layout.columnLabels?.comments || "Comments",
      type: "writeback",
    },
  ];
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

    // Add empty writeback columns (status and comments) for user input
    formattedRow.status = {
      value: "",
      editable: true,
    };
    formattedRow.comments = {
      value: "",
      editable: true,
    };

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

      // State for the processed table data
      const [tableData, setTableData] = useState(null);
      // State to track user edits in writeback cells
      const [editedData, setEditedData] = useState({});

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
        console.log("index.js: Table data effect triggered", tableData);

        if (!tableData) {
          console.log("index.js: No table data available yet");
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
            th.addEventListener("click", () => {
              console.log(`index.js: Sort clicked for ${header.id}`);
              // Sorting logic would be implemented here
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

          // Apply alternating row colors if enabled
          if (layout.tableOptions?.rowAlternation && rowIndex % 2 === 1) {
            tr.className = "alternate";
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
              if (cellData.selectable && layout.tableOptions?.allowSelections) {
                console.log(
                  `index.js: Creating selectable cell for ${header.id} at row ${rowIndex}`
                );

                td.className = "selectable";
                td.addEventListener("click", () => {
                  console.log(
                    `index.js: Selection clicked for ${header.id} with elemNumber ${cellData.qElemNumber}`
                  );
                  // TODO: Implement actual Qlik selection logic here
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
            font-family: sans-serif;
          }
          
          /* Header styling */
          .writeback-table th {
            background-color: #f2f2f2;
            padding: 8px;
            text-align: left;
            border-bottom: 2px solid #ddd;
            cursor: default;
          }
          
          /* Sortable header styling */
          .writeback-table th.sortable {
            cursor: pointer;
          }
          
          /* Cell styling */
          .writeback-table td {
            padding: 8px;
            border-bottom: 1px solid #ddd;
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
            background-color: #eee;
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
      }, [tableData, editedData, layout]);

      // Cleanup function when component is unmounted
      return () => {
        console.log("index.js: Component cleanup");
        element.innerHTML = "";
      };
    },
  };
}
