// ui/tableRenderer.js
/**
 * Table rendering component for the writeback extension
 * UPDATED: Risk column progress bars and reordered columns
 */

import {
  COLUMN_TYPES,
  STATUS_OPTIONS,
  STATUS_ICONS,
  RISK_LEVELS, // Updated from CHURN_RISK_LEVELS
  CSS_CLASSES,
  SPECIAL_COLUMNS,
} from "../utils/constants.js";
import { extractCustomerName, generateDataKey } from "../core/dataProcessor.js"; // Updated

export class TableRenderer {
  constructor(options = {}) {
    this.onCellEdit = options.onCellEdit || (() => {});
    this.onRowSelect = options.onRowSelect || (() => {});
    this.onSort = options.onSort || (() => {});
  }

  /**
   * Render the complete table
   * @param {Object} params - Render parameters
   */
  render({
    container,
    tableData,
    editedData,
    selectedRow,
    layout,
    currentPage,
  }) {
    console.log("TableRenderer: Starting table render");

    // Create table wrapper for scrolling
    const tableWrapper = document.createElement("div");
    tableWrapper.className = CSS_CLASSES.SCROLL_WRAPPER;
    container.appendChild(tableWrapper);

    // Create table DOM structure
    const table = document.createElement("table");
    table.className = CSS_CLASSES.TABLE;
    tableWrapper.appendChild(table);

    // Render header
    this.renderHeader(table, tableData.headers, layout);

    // Render body
    this.renderBody(
      table,
      tableData,
      editedData,
      selectedRow,
      layout,
      currentPage
    );

    console.log("TableRenderer: Table render complete");
  }

  /**
   * Render table header
   * @param {HTMLElement} table - Table element
   * @param {Array} headers - Header configuration
   * @param {Object} layout - Layout object
   */
  /**
   * Add sorting functionality to header
   * @param {HTMLElement} th - Header element
   * @param {Object} header - Header configuration
   * @param {Object} layout - Layout object
   */
  addSortingToHeader(th, header, layout) {
    th.className = CSS_CLASSES.SORTABLE;

    // Create sort icon container
    const sortIconContainer = document.createElement("div");
    sortIconContainer.className = "sort-icon-container";

    // Create ascending and descending sort icons
    const ascIcon = document.createElement("span");
    ascIcon.className = "sort-icon asc-icon";
    ascIcon.textContent = "▲";
    ascIcon.title = `Sort ${header.label} ascending`;

    const descIcon = document.createElement("span");
    descIcon.className = "sort-icon desc-icon";
    descIcon.textContent = "▼";
    descIcon.title = `Sort ${header.label} descending`;

    sortIconContainer.appendChild(ascIcon);
    sortIconContainer.appendChild(descIcon);
    th.appendChild(sortIconContainer);

    // Add click handlers for individual sort directions
    ascIcon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`Ascending sort clicked for ${header.id}`);
      this.onSort(header, "asc");
    });

    descIcon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`Descending sort clicked for ${header.id}`);
      this.onSort(header, "desc");
    });

    // Also allow clicking the header itself to toggle sort
    th.addEventListener("click", (e) => {
      // Only if clicking the header directly, not the icons
      if (e.target === th || e.target.textContent === header.label) {
        e.preventDefault();
        e.stopPropagation();
        // Default to ascending on header click
        this.onSort(header, "asc");
      }
    });
  }

  /**
   * Render table body
   * @param {HTMLElement} table - Table element
   * @param {Object} tableData - Table data
   * @param {Object} editedData - Edited data
   * @param {number} selectedRow - Selected row index
   * @param {Object} layout - Layout object
   * @param {number} currentPage - Current page number
   */
  /**
   * Render table header
   * @param {HTMLElement} table - Table element
   * @param {Array} headers - Header configuration
   * @param {Object} layout - Layout object
   */
  renderHeader(table, headers, layout) {
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    headers.forEach((header) => {
      console.log(`TableRenderer: Creating header for ${header.id}`);

      const th = document.createElement("th");
      th.textContent = header.label;
      th.setAttribute("data-field", header.id);
      th.setAttribute("data-type", header.type);

      // Add sorting capability ONLY for Amount column
      if (
        layout.tableOptions?.allowSorting &&
        header.type !== COLUMN_TYPES.WRITEBACK &&
        (header.id === "Amount" || header.label === "Amount")
      ) {
        this.addSortingToHeader(th, header, layout);
      }

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);
  }

  /**
   * Add sorting functionality to header
   * @param {HTMLElement} th - Header element
   * @param {Object} header - Header configuration
   * @param {Object} layout - Layout object
   */
  addSortingToHeader(th, header, layout) {
    th.className = CSS_CLASSES.SORTABLE;

    // Create sort icon container
    const sortIconContainer = document.createElement("div");
    sortIconContainer.className = "sort-icon-container";

    // Create ascending and descending sort icons
    const ascIcon = document.createElement("span");
    ascIcon.className = "sort-icon asc-icon";
    ascIcon.textContent = "▲";
    ascIcon.title = `Sort ${header.label} ascending`;

    const descIcon = document.createElement("span");
    descIcon.className = "sort-icon desc-icon";
    descIcon.textContent = "▼";
    descIcon.title = `Sort ${header.label} descending`;

    sortIconContainer.appendChild(ascIcon);
    sortIconContainer.appendChild(descIcon);
    th.appendChild(sortIconContainer);

    // Add click handlers for individual sort directions
    ascIcon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`Ascending sort clicked for ${header.id}`);
      this.onSort(header, "asc");
    });

    descIcon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`Descending sort clicked for ${header.id}`);
      this.onSort(header, "desc");
    });

    // Also allow clicking the header itself to toggle sort
    th.addEventListener("click", (e) => {
      // Only if clicking the header directly, not the icons
      if (e.target === th || e.target.textContent === header.label) {
        e.preventDefault();
        e.stopPropagation();
        // Default to ascending on header click
        this.onSort(header, "asc");
      }
    });
  }

  /**
   * Render table body
   * @param {HTMLElement} table - Table element
   * @param {Object} tableData - Table data
   * @param {Object} editedData - Edited data
   * @param {number} selectedRow - Selected row index
   * @param {Object} layout - Layout object
   * @param {number} currentPage - Current page number
   */
  renderBody(table, tableData, editedData, selectedRow, layout, currentPage) {
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
        tr.classList.add(CSS_CLASSES.ALTERNATE);
      }

      // Create cells for each column
      tableData.headers.forEach((header) => {
        const td = this.createCell(
          row,
          header,
          editedData,
          rowIndex,
          layout,
          currentPage,
          tr
        );
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  /**
   * Create a table cell
   * @param {Object} row - Row data
   * @param {Object} header - Header configuration
   * @param {Object} editedData - Edited data
   * @param {number} rowIndex - Row index
   * @param {Object} layout - Layout object
   * @param {number} currentPage - Current page number
   * @param {HTMLElement} tr - Table row element
   * @returns {HTMLElement} Table cell element
   */
  createCell(row, header, editedData, rowIndex, layout, currentPage, tr) {
    const td = document.createElement("td");
    const cellData = row[header.id];

    // Handle writeback columns (editable inputs)
    if (header.type === COLUMN_TYPES.WRITEBACK) {
      this.createWritebackCell(
        td,
        row,
        header,
        editedData,
        rowIndex,
        currentPage
      );
    } else {
      this.createDataCell(td, cellData, header, rowIndex, layout, tr);
    }

    return td;
  }

  /**
   * Create writeback (editable) cell
   * @param {HTMLElement} td - Cell element
   * @param {Object} row - Row data
   * @param {Object} header - Header configuration
   * @param {Object} editedData - Edited data
   * @param {number} rowIndex - Row index
   * @param {number} currentPage - Current page number
   */
  createWritebackCell(td, row, header, editedData, rowIndex, currentPage) {
    const customerName = extractCustomerName(row, rowIndex, currentPage);
    const dataKey = generateDataKey(customerName, header.id);
    const cellData = row[header.id];

    if (header.id === "status") {
      this.createStatusDropdown(
        td,
        cellData,
        editedData,
        dataKey,
        customerName
      );
    } else {
      this.createTextInput(
        td,
        cellData,
        editedData,
        dataKey,
        customerName,
        header.id
      );
    }
  }

  /**
   * Create status dropdown cell
   * @param {HTMLElement} td - Cell element
   * @param {Object} cellData - Cell data
   * @param {Object} editedData - Edited data
   * @param {string} dataKey - Data key
   * @param {string} customerName - Customer name
   */
  createStatusDropdown(td, cellData, editedData, dataKey, customerName) {
    const selectContainer = document.createElement("div");
    selectContainer.className = "status-select-container";

    const select = document.createElement("select");
    select.className = "status-select";

    // Use edited value if it exists, otherwise use default
    const selectedValue = editedData[dataKey] || cellData.value || "";

    // Create options for the dropdown
    STATUS_OPTIONS.forEach((opt) => {
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

    // Create status icon
    const statusIcon = document.createElement("span");
    statusIcon.className = "status-icon";

    // Set initial icon and color based on current value
    this.updateStatusAppearance(selectContainer, statusIcon, selectedValue);

    // Handle changes to the dropdown
    select.addEventListener("change", (e) => {
      console.log(
        `Status changed for customer ${customerName}:`,
        e.target.value
      );

      this.onCellEdit(customerName, "status", e.target.value);
      this.updateStatusAppearance(selectContainer, statusIcon, e.target.value);
    });

    selectContainer.appendChild(statusIcon);
    selectContainer.appendChild(select);
    td.appendChild(selectContainer);
  }

  /**
   * Update status dropdown appearance
   * @param {HTMLElement} container - Container element
   * @param {HTMLElement} icon - Icon element
   * @param {string} value - Status value
   */
  updateStatusAppearance(container, icon, value) {
    // Clear existing classes
    container.className = "status-select-container";
    icon.className = "status-icon";

    if (value === "Accurate") {
      icon.innerHTML = STATUS_ICONS.Accurate;
      icon.classList.add("thumbs-up-icon");
      container.classList.add("status-green");
    } else if (value === "Inaccurate") {
      icon.innerHTML = STATUS_ICONS.Inaccurate;
      icon.classList.add("thumbs-down-icon");
      container.classList.add("status-red");
    } else {
      icon.innerHTML = STATUS_ICONS[""];
    }
  }

  /**
   * Create text input cell
   * @param {HTMLElement} td - Cell element
   * @param {Object} cellData - Cell data
   * @param {Object} editedData - Edited data
   * @param {string} dataKey - Data key
   * @param {string} customerName - Customer name
   * @param {string} fieldId - Field ID
   */
  createTextInput(td, cellData, editedData, dataKey, customerName, fieldId) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "comments-input";
    input.value = editedData[dataKey] || cellData.value || "";

    // Handle changes to the input field
    input.addEventListener("change", (e) => {
      console.log(
        `${fieldId} changed for customer ${customerName}:`,
        e.target.value
      );
      this.onCellEdit(customerName, fieldId, e.target.value);
    });

    td.appendChild(input);
  }

  /**
   * Create data (non-editable) cell
   * @param {HTMLElement} td - Cell element
   * @param {Object} cellData - Cell data
   * @param {Object} header - Header configuration
   * @param {number} rowIndex - Row index
   * @param {Object} layout - Layout object
   * @param {HTMLElement} tr - Table row element
   */
  createDataCell(td, cellData, header, rowIndex, layout, tr) {
    // Special formatting for Risk column (like the original Probability of Churn)
    if (header.id === SPECIAL_COLUMNS.RISK || header.label === "Risk") {
      this.createRiskProgressBar(td, cellData);
    }
    // Keep original churn logic if it exists
    else if (header.id === SPECIAL_COLUMNS.PROBABILITY_OF_CHURN) {
      this.createChurnProgressBar(td, cellData);
    } else {
      // Regular cell for dimensions and measures
      td.textContent = cellData.value;
    }

    // Add selection capability for dimension cells if enabled
    if (cellData.selectable && layout.tableOptions?.allowSelections) {
      td.className = CSS_CLASSES.SELECTABLE;
      td.setAttribute("data-col", header.id);
      td.setAttribute("data-elem-number", cellData.qElemNumber);

      // Add click handler for selection
      td.addEventListener("click", () => {
        // Visual feedback
        const tbody = td.closest("tbody");
        const allRows = tbody.querySelectorAll("tr");
        allRows.forEach((r) => r.classList.remove("selected-row"));
        tr.classList.add("selected-row");

        // Trigger selection callback
        this.onRowSelect(rowIndex, cellData, header);
      });
    }
  }

  /**
   * Create risk progress bar (adapted from churn probability logic)
   * @param {HTMLElement} td - Cell element
   * @param {Object} cellData - Cell data
   */
  createRiskProgressBar(td, cellData) {
    // Create container for the bar and text
    const barContainer = document.createElement("div");
    barContainer.className = "risk-bar-container";

    // Add the text display for the value
    const valueText = document.createElement("span");
    valueText.className = "risk-value-text";
    valueText.textContent = cellData.value;

    // Create the progress bar
    const progressBar = document.createElement("div");
    progressBar.className = "risk-progress-bar";

    // Get the numeric value (removing % symbol if present)
    let numValue = parseFloat(cellData.value.replace("%", ""));
    if (isNaN(numValue)) {
      // Try getting the numeric value from the qNum property if available
      numValue = cellData.qNum || 0;
    }

    // Set the width of the progress bar based on the value
    progressBar.style.width = `${numValue}%`;

    // Set color based on the value (risk levels)
    if (numValue >= RISK_LEVELS.HIGH.threshold) {
      progressBar.classList.add(RISK_LEVELS.HIGH.className);
    } else if (numValue >= RISK_LEVELS.MEDIUM.threshold) {
      progressBar.classList.add(RISK_LEVELS.MEDIUM.className);
    } else if (numValue >= RISK_LEVELS.LOW.threshold) {
      progressBar.classList.add(RISK_LEVELS.LOW.className);
    } else {
      progressBar.classList.add(RISK_LEVELS.VERY_LOW.className);
    }

    // Add elements to the container
    barContainer.appendChild(progressBar);
    barContainer.appendChild(valueText);

    // Add the container to the cell
    td.appendChild(barContainer);
  }

  /**
   * Create churn probability progress bar (keep original logic)
   * @param {HTMLElement} td - Cell element
   * @param {Object} cellData - Cell data
   */
  createChurnProgressBar(td, cellData) {
    // Create container for the bar and text
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

    // Set color based on the value using RISK_LEVELS (since CHURN_RISK_LEVELS removed)
    if (numValue >= RISK_LEVELS.HIGH.threshold) {
      progressBar.classList.add(RISK_LEVELS.HIGH.className);
    } else if (numValue >= RISK_LEVELS.MEDIUM.threshold) {
      progressBar.classList.add(RISK_LEVELS.MEDIUM.className);
    } else if (numValue >= RISK_LEVELS.LOW.threshold) {
      progressBar.classList.add(RISK_LEVELS.LOW.className);
    } else {
      progressBar.classList.add(RISK_LEVELS.VERY_LOW.className);
    }

    // Add elements to the container
    barContainer.appendChild(progressBar);
    barContainer.appendChild(valueText);

    // Add the container to the cell
    td.appendChild(barContainer);
  }
}
