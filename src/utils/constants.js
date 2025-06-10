// utils/constants.js
/**
 * Application constants and enums
 * UPDATED: Customer name based system with Risk levels
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

// UPDATED: Risk levels for the Risk column (replacing churn risk levels)
export const RISK_LEVELS = {
  VERY_LOW: { threshold: 0, className: "risk-very-low" },
  LOW: { threshold: 25, className: "risk-low" },
  MEDIUM: { threshold: 50, className: "risk-medium" },
  HIGH: { threshold: 70, className: "risk-high" },
};

// LEGACY: Keep churn risk levels for backward compatibility if needed
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
  PROCESSING: "processing",
};

export const QLIK_SORT_INDICATORS = {
  ASC: "A",
  DESC: "D",
};

export const WRITEBACK_COLUMNS = {
  STATUS: "status",
  COMMENTS: "comments",
};

// UPDATED: Special columns for the new data structure
export const SPECIAL_COLUMNS = {
  PROBABILITY_OF_CHURN: "Probability of Churn", // Legacy
  RISK: "Risk",
  CUSTOMER: "Customer", // CHANGE THIS - use label instead of CUSTOMER_NAME
  AMOUNT: "Amount",
  AGING_BUCKETS: "Aging Bucket", // CHANGE THIS - use label instead of ModelInput.Aging Bucket
  DAYS_PAST_DUE: "Days Past Due", // CHANGE THIS - use label instead of ModelInput.Days Past Due
};

// UPDATED: Field mappings for database columns
export const DB_FIELD_MAPPINGS = {
  CUSTOMER_NAME: "customer_name",
  AMOUNT: "amount",
  AGING_BUCKET: "aging_bucket",
  DAYS_PAST_DUE: "days_past_due",
  RISK_SCORE: "risk_score",
  MODEL_FEEDBACK: "model_feedback",
  COMMENTS: "comments",
  APP_ID: "app_id",
  VERSION: "version",
  CREATED_AT: "created_at",
  MODIFIED_AT: "modified_at",
  CREATED_BY: "created_by",
  MODIFIED_BY: "modified_by",
  SESSION_ID: "session_id",
  EDIT_STARTED_AT: "edit_started_at",
  EDIT_DURATION_SECONDS: "edit_duration_seconds",
  PROBABILITY_OF_CHURN: "probability_of_churn", // Legacy field
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

// UPDATED: Column order for the reordered table
export const COLUMN_ORDER = {
  CUSTOMER: 0,
  AGING_BUCKETS: 1,
  DAYS_PAST_DUE: 2,
  RISK: 3,
  AMOUNT: 4,
  MODEL_FEEDBACK: 5,
  COMMENTS: 6,
};

// Risk thresholds for color coding
export const RISK_THRESHOLDS = {
  VERY_LOW_MAX: 25,
  LOW_MAX: 50,
  MEDIUM_MAX: 70,
  HIGH_MIN: 70,
};

// User interaction constants
export const USER_INTERACTION = {
  EDIT_TIMEOUT: 30000, // 30 seconds before edit session expires
  SAVE_DEBOUNCE: 500, // 500ms debounce for auto-save
  CONFLICT_CHECK_INTERVAL: 10000, // 10 seconds between conflict checks
};

export const PAGE_CHANGE_DELAY = 2000; // 2 seconds for user page change flag reset

// Storage keys for localStorage
export const STORAGE_KEYS = {
  EDITED_DATA: "qlik_writeback_edited_data",
  USER_PREFERENCES: "qlik_writeback_user_prefs",
  LAST_SAVE_TIME: "qlik_writeback_last_save",
};

// API endpoint constants (if needed)
export const API_ENDPOINTS = {
  SAVE_WRITEBACK: "/api/writeback/save",
  FETCH_WRITEBACK: "/api/writeback/fetch",
  CHECK_CONFLICTS: "/api/writeback/conflicts",
};

// Error messages
export const ERROR_MESSAGES = {
  SAVE_FAILED: "Failed to save changes to database",
  FETCH_FAILED: "Failed to fetch writeback data",
  INVALID_DATA: "Invalid data format received",
  CONNECTION_ERROR: "Unable to connect to database",
  PERMISSION_DENIED: "You don't have permission to save changes",
  CUSTOMER_NOT_FOUND: "Customer not found in current dataset",
};

// Success messages
export const SUCCESS_MESSAGES = {
  SAVE_COMPLETE: "All changes saved successfully",
  DATA_REFRESHED: "Data refreshed from database",
  CONFLICT_RESOLVED: "Data conflicts resolved",
};
