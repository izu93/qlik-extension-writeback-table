// ui/tableRenderer.js
/**
 * Table rendering component for the writeback extension
 * CLEAN: No sorting functionality - simple table display
 */

import {
  COLUMN_TYPES,
  STATUS_OPTIONS,
  STATUS_ICONS,
  CSS_CLASSES,
  SPECIAL_COLUMNS,
} from "../utils/constants.js";
import { extractCustomerName, generateDataKey } from "../core/dataProcessor.js";

export class TableRenderer {
  constructor(options = {}) {
    this.onCellEdit = options.onCellEdit || (() => {});
    this.onRowSelect = options.onRowSelect || (() => {});
  }

  /**
   * Render the complete table
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
   * Render table header - CLEAN: No sort functionality
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

      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);
  }

  /**
   * Render table body
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
   * Create data (non-editable) cell - SIMPLE: Just text
   */
  createDataCell(td, cellData, header, rowIndex, layout, tr) {
    // Simple text display for all columns
    td.textContent = cellData.value;

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
}
