// utils/constants.js
/**
 * Application constants and enums
 */

export const COLUMN_TYPES = {
  DIMENSION: "dimension",
  MEASURE: "measure",
  WRITEBACK: "writeback",
};

export const SORT_DIRECTIONS = {
  ASC: "asc",
  DESC: "desc",
  NONE: "",
};

export const STATUS_OPTIONS = [
  { value: "", text: "N/A", className: "" },
  { value: "Accurate", text: "Accurate", className: "thumbs-up" },
  { value: "Inaccurate", text: "Inaccurate", className: "thumbs-down" },
];

export const STATUS_ICONS = {
  Accurate: "👍",
  Inaccurate: "👎",
  "": "",
};

export const CHURN_RISK_LEVELS = {
  VERY_LOW: { threshold: 5, className: "very-low-risk" },
  LOW: { threshold: 30, className: "low-risk" },
  MEDIUM: { threshold: 90, className: "medium-risk" },
  HIGH: { threshold: 100, className: "high-risk" },
};

export const MESSAGE_TYPES = {
  SUCCESS: "success",
  ERROR: "error",
  WARNING: "warning",
  INFO: "info",
};

export const QLIK_SORT_INDICATORS = {
  ASC: "A",
  DESC: "D",
};

export const WRITEBACK_COLUMNS = {
  STATUS: "status",
  COMMENTS: "comments",
};

export const SPECIAL_COLUMNS = {
  PROBABILITY_OF_CHURN: "Probability of Churn",
  ACCOUNT_ID: "AccountID",
};

export const CSS_CLASSES = {
  CONTAINER: "writeback-table-container",
  TABLE: "writeback-table",
  SCROLL_WRAPPER: "table-scroll-wrapper",
  SELECTABLE: "selectable",
  SELECTED_ROW: "selected-row",
  ALTERNATE: "alternate",
  SORTABLE: "sortable",
  LOADING_OVERLAY: "loading-overlay",
  PAGINATION_CONTAINER: "pagination-container",
  SAVE_BUTTON: "save-all-button",
};

export const PAGE_CHANGE_DELAY = 2000; // 2 seconds for user page change flag reset
