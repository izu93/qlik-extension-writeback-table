// core/paginationManager.js
/**
 * Pagination management for Qlik hypercube data
 */

import { calculatePaginationInfo, getPageSize } from "./dataProcessor.js";
import { PAGE_CHANGE_DELAY } from "../utils/constants.js";

/**
 * Pagination Manager class
 */
export class PaginationManager {
  constructor(model) {
    this.model = model;
    this.currentPage = 1;
    this.totalRows = 0;
    this.paginationInfo = {
      pageSize: 100,
      totalPages: 1,
      currentPageFirstRow: 1,
      currentPageLastRow: 100,
    };
    this.userChangedPage = false;
    this.resetPageFlagTimer = null;
  }

  /**
   * Initialize pagination with layout data
   * @param {Object} layout - Qlik layout object
   */
  initialize(layout) {
    this.totalRows = layout.qHyperCube?.qSize?.qcy || 0;
    const pageSize = getPageSize(layout);
    this.paginationInfo = calculatePaginationInfo(
      this.totalRows,
      pageSize,
      this.currentPage
    );
    console.log(
      `Pagination initialized: ${this.totalRows} total rows, page size: ${pageSize}`
    );
  }

  /**
   * Fetch data for a specific page
   * @param {number} page - Page number to fetch
   * @returns {Promise<Array>} Page data matrix
   */
  async fetchPageData(page) {
    try {
      const pageSize = this.paginationInfo.pageSize;
      const qHeight = pageSize;
      const qTop = (page - 1) * pageSize;

      console.log(`Fetching page ${page} data: top=${qTop}, height=${qHeight}`);

      // Request data for the current page
      const dataPages = await this.model.getHyperCubeData("/qHyperCubeDef", [
        {
          qTop: qTop,
          qLeft: 0,
          qWidth: 10, // Match the width from object-properties
          qHeight: qHeight,
        },
      ]);

      console.log(`Received data for page ${page}:`, dataPages[0]);
      return dataPages[0].qMatrix;
    } catch (error) {
      console.error("Error fetching page data:", error);
      return [];
    }
  }

  /**
   * Change to a specific page
   * @param {number} newPage - New page number
   * @param {Function} onPageChange - Callback function when page changes
   * @returns {Promise<Array>} Page data matrix
   */
  async changePage(newPage, onPageChange) {
    try {
      console.log(
        `Changing to page ${newPage} (current: ${this.currentPage}, total: ${this.paginationInfo.totalPages})`
      );

      if (newPage < 1 || newPage > this.paginationInfo.totalPages) {
        console.log(`Invalid page number ${newPage}`);
        return []; // Don't process invalid pages
      }

      // Set flag BEFORE anything else
      this.setUserChangedPage(true);

      // Set page before fetching data to avoid visual jumps
      this.currentPage = newPage;

      // Fetch data for the new page
      const pageData = await this.fetchPageData(newPage);

      console.log(
        `Processing data for page ${newPage}, got ${pageData.length} rows`
      );

      // Update pagination display
      this.updatePaginationInfo();

      // Call the page change callback if provided
      if (onPageChange) {
        onPageChange({
          page: newPage,
          pageData,
          paginationInfo: this.paginationInfo,
        });
      }

      console.log(
        `Page change complete. Now on page ${newPage} of ${this.paginationInfo.totalPages}`
      );

      return pageData;
    } catch (error) {
      console.error("Error changing page:", error);
      this.setUserChangedPage(false);
      return [];
    }
  }

  /**
   * Set user changed page flag with auto-reset timer
   * @param {boolean} value - Flag value
   */
  setUserChangedPage(value) {
    this.userChangedPage = value;

    if (value) {
      // Clear existing timer
      if (this.resetPageFlagTimer) {
        clearTimeout(this.resetPageFlagTimer);
      }

      // Set new timer to reset flag
      this.resetPageFlagTimer = setTimeout(() => {
        this.userChangedPage = false;
        console.log("Resetting userChangedPage flag");
      }, PAGE_CHANGE_DELAY);

      console.log("Starting page change, userChangedPage =", true);
    }
  }

  /**
   * Update pagination info based on current state
   */
  updatePaginationInfo() {
    this.paginationInfo = calculatePaginationInfo(
      this.totalRows,
      this.paginationInfo.pageSize,
      this.currentPage
    );
  }

  /**
   * Check if should reset to page one based on conditions
   * @param {Object} layout - Current layout
   * @param {string} layoutId - Current layout ID
   * @param {string} lastLayoutId - Previous layout ID
   * @returns {boolean} Whether to reset to page 1
   */
  shouldResetToPageOne(layout, layoutId, lastLayoutId) {
    const isNewLayout = layoutId !== lastLayoutId;
    const dataChanged = this.totalRows !== (layout.qHyperCube?.qSize?.qcy || 0);
    const inSelections = layout.qSelectionInfo?.qInSelections;

    return (
      !this.userChangedPage && (isNewLayout || dataChanged) && !inSelections
    );
  }

  /**
   * Go to next page
   * @param {Function} onPageChange - Callback function
   * @returns {Promise<Array>} Page data matrix
   */
  async nextPage(onPageChange) {
    if (this.currentPage < this.paginationInfo.totalPages) {
      return await this.changePage(this.currentPage + 1, onPageChange);
    }
    return [];
  }

  /**
   * Go to previous page
   * @param {Function} onPageChange - Callback function
   * @returns {Promise<Array>} Page data matrix
   */
  async previousPage(onPageChange) {
    if (this.currentPage > 1) {
      return await this.changePage(this.currentPage - 1, onPageChange);
    }
    return [];
  }

  /**
   * Go to first page
   * @param {Function} onPageChange - Callback function
   * @returns {Promise<Array>} Page data matrix
   */
  async firstPage(onPageChange) {
    return await this.changePage(1, onPageChange);
  }

  /**
   * Go to last page
   * @param {Function} onPageChange - Callback function
   * @returns {Promise<Array>} Page data matrix
   */
  async lastPage(onPageChange) {
    return await this.changePage(this.paginationInfo.totalPages, onPageChange);
  }

  /**
   * Get current page info
   * @returns {Object} Current page information
   */
  getCurrentPageInfo() {
    return {
      currentPage: this.currentPage,
      totalPages: this.paginationInfo.totalPages,
      totalRows: this.totalRows,
      pageSize: this.paginationInfo.pageSize,
      firstRow: this.paginationInfo.currentPageFirstRow,
      lastRow: this.paginationInfo.currentPageLastRow,
      userChangedPage: this.userChangedPage,
    };
  }

  /**
   * Reset pagination state
   */
  reset() {
    this.currentPage = 1;
    this.userChangedPage = false;
    if (this.resetPageFlagTimer) {
      clearTimeout(this.resetPageFlagTimer);
      this.resetPageFlagTimer = null;
    }
  }

  /**
   * Cleanup timers and resources
   */
  destroy() {
    if (this.resetPageFlagTimer) {
      clearTimeout(this.resetPageFlagTimer);
      this.resetPageFlagTimer = null;
    }
  }
}
