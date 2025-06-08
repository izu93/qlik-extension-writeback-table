// ui/paginationRenderer.js
/**
 * Pagination controls renderer for the writeback extension
 */

import { CSS_CLASSES } from "../utils/constants.js";

export class PaginationRenderer {
  constructor(options = {}) {
    this.onPageChange = options.onPageChange || (() => {});
  }

  /**
   * Render pagination controls
   * @param {Object} params - Render parameters
   */
  render({ container, pageInfo, layout, hasUnsavedChanges, isSaving, onSave }) {
    console.log("PaginationRenderer: Creating pagination controls");

    // Create pagination container
    const paginationContainer = document.createElement("div");
    paginationContainer.className = "pagination-container";

    // Display rows info
    this.renderRowsInfo(paginationContainer, pageInfo);

    // Create pagination controls
    this.renderPaginationControls(paginationContainer, pageInfo);

    // Add save button if writeback is enabled
    if (layout.tableOptions?.allowWriteback) {
      this.renderSaveButton(
        paginationContainer,
        hasUnsavedChanges,
        isSaving,
        onSave
      );
    }

    container.appendChild(paginationContainer);
    console.log("PaginationRenderer: Pagination controls added to DOM");
  }

  /**
   * Render rows information display
   * @param {HTMLElement} container - Pagination container
   * @param {Object} pageInfo - Page information
   */
  renderRowsInfo(container, pageInfo) {
    const rowsInfo = document.createElement("div");
    rowsInfo.className = "rows-info";
    rowsInfo.textContent = `Showing ${pageInfo.firstRow}–${pageInfo.lastRow} of ${pageInfo.totalRows} records`;
    container.appendChild(rowsInfo);
  }

  /**
   * Render pagination controls
   * @param {HTMLElement} container - Pagination container
   * @param {Object} pageInfo - Page information
   */
  renderPaginationControls(container, pageInfo) {
    const paginationControls = document.createElement("div");
    paginationControls.className = "pagination-controls";

    // Previous page button
    this.renderPreviousButton(paginationControls, pageInfo);

    // Page number input
    this.renderPageNumberInput(paginationControls, pageInfo);

    // Next page button
    this.renderNextButton(paginationControls, pageInfo);

    container.appendChild(paginationControls);
  }

  /**
   * Render previous page button
   * @param {HTMLElement} controls - Controls container
   * @param {Object} pageInfo - Page information
   */
  renderPreviousButton(controls, pageInfo) {
    const prevButton = document.createElement("button");
    prevButton.className =
      "pagination-button prev-button" +
      (pageInfo.currentPage <= 1 ? " disabled" : "");
    prevButton.innerHTML = "← Prev";
    prevButton.disabled = pageInfo.currentPage <= 1;

    prevButton.addEventListener("click", () => {
      if (pageInfo.currentPage > 1) {
        this.onPageChange(pageInfo.currentPage - 1);
      }
    });

    controls.appendChild(prevButton);
  }

  /**
   * Render page number input
   * @param {HTMLElement} controls - Controls container
   * @param {Object} pageInfo - Page information
   */
  renderPageNumberInput(controls, pageInfo) {
    const pageNumberContainer = document.createElement("div");
    pageNumberContainer.className = "page-number-container";

    const pageInput = document.createElement("input");
    pageInput.type = "text";
    pageInput.className = "page-input";
    pageInput.value = pageInfo.currentPage;
    pageInput.size = 3;

    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const newPage = parseInt(e.target.value, 10);
        if (!isNaN(newPage) && newPage > 0 && newPage <= pageInfo.totalPages) {
          this.onPageChange(newPage);
        } else {
          // Invalid page, reset to current
          e.target.value = pageInfo.currentPage;
        }
      }
    });

    pageNumberContainer.appendChild(pageInput);

    const pageTotal = document.createElement("span");
    pageTotal.className = "page-total";
    pageTotal.textContent = ` / ${pageInfo.totalPages}`;
    pageNumberContainer.appendChild(pageTotal);

    controls.appendChild(pageNumberContainer);
  }

  /**
   * Render next page button
   * @param {HTMLElement} controls - Controls container
   * @param {Object} pageInfo - Page information
   */
  renderNextButton(controls, pageInfo) {
    const nextButton = document.createElement("button");
    nextButton.className =
      "pagination-button next-button" +
      (pageInfo.currentPage >= pageInfo.totalPages ? " disabled" : "");
    nextButton.innerHTML = "Next →";
    nextButton.disabled = pageInfo.currentPage >= pageInfo.totalPages;

    nextButton.addEventListener("click", () => {
      if (pageInfo.currentPage < pageInfo.totalPages) {
        this.onPageChange(pageInfo.currentPage + 1);
      }
    });

    controls.appendChild(nextButton);
  }

  /**
   * Render save changes button
   * @param {HTMLElement} container - Pagination container
   * @param {boolean} hasUnsavedChanges - Whether there are unsaved changes
   * @param {boolean} isSaving - Whether save is in progress
   * @param {Function} onSave - Save callback function
   */
  renderSaveButton(container, hasUnsavedChanges, isSaving, onSave) {
    const saveButtonContainer = document.createElement("div");
    saveButtonContainer.className = "save-button-container";

    const saveButton = document.createElement("button");
    saveButton.className = CSS_CLASSES.SAVE_BUTTON;
    saveButton.textContent = "Save All Changes";

    // Button state management
    saveButton.disabled = !hasUnsavedChanges || isSaving;

    if (isSaving) {
      saveButton.classList.add("saving");
      saveButton.textContent = "Saving...";
    }

    // Click handler with proper event handling
    saveButton.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isSaving && hasUnsavedChanges) {
          console.log("Save button clicked, triggering save");
          onSave();
        } else {
          console.log("Save ignored - either already saving or no changes");
        }
      },
      { once: false }
    );

    saveButtonContainer.appendChild(saveButton);
    container.appendChild(saveButtonContainer);
  }

  /**
   * Update pagination display without full re-render
   * @param {Object} pageInfo - Updated page information
   */
  updatePageInfo(pageInfo) {
    // Update rows info
    const rowsInfo = document.querySelector(".rows-info");
    if (rowsInfo) {
      rowsInfo.textContent = `Showing ${pageInfo.firstRow}–${pageInfo.lastRow} of ${pageInfo.totalRows} records`;
    }

    // Update page input
    const pageInput = document.querySelector(".page-input");
    if (pageInput) {
      pageInput.value = pageInfo.currentPage;
    }

    // Update page total
    const pageTotal = document.querySelector(".page-total");
    if (pageTotal) {
      pageTotal.textContent = ` / ${pageInfo.totalPages}`;
    }

    // Update button states
    const prevButton = document.querySelector(".prev-button");
    if (prevButton) {
      prevButton.disabled = pageInfo.currentPage <= 1;
      prevButton.className =
        "pagination-button prev-button" +
        (pageInfo.currentPage <= 1 ? " disabled" : "");
    }

    const nextButton = document.querySelector(".next-button");
    if (nextButton) {
      nextButton.disabled = pageInfo.currentPage >= pageInfo.totalPages;
      nextButton.className =
        "pagination-button next-button" +
        (pageInfo.currentPage >= pageInfo.totalPages ? " disabled" : "");
    }
  }

  /**
   * Update save button state
   * @param {boolean} hasUnsavedChanges - Whether there are unsaved changes
   * @param {boolean} isSaving - Whether save is in progress
   */
  updateSaveButton(hasUnsavedChanges, isSaving) {
    const saveButton = document.querySelector(`.${CSS_CLASSES.SAVE_BUTTON}`);
    if (!saveButton) return;

    saveButton.disabled = !hasUnsavedChanges || isSaving;

    if (isSaving) {
      saveButton.classList.add("saving");
      saveButton.textContent = "Saving...";
    } else {
      saveButton.classList.remove("saving");
      saveButton.textContent = "Save All Changes";
    }
  }
}
