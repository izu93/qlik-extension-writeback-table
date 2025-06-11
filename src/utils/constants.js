// utils/constants.js
/**
 * Application constants and enums
 * UPDATED: New column names from Qlik model
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

// Risk levels for progress bars - DISABLED for now
export const RISK_LEVELS = {
  VERY_LOW: { threshold: 0, className: "risk-very-low" },
  LOW: { threshold: 25, className: "risk-low" },
  MEDIUM: { threshold: 50, className: "risk-medium" },
  HIGH: { threshold: 70, className: "risk-high" },
};

// DISABLED: Don't show progress bars for predicted payment bucket
export const SHOW_PROGRESS_BARS = false;

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

// UPDATED: Exact column mappings from your Qlik model
export const SPECIAL_COLUMNS = {
  // Your exact field names from the screenshots
  CUSTOMER: "Customer", // Main identifier
  INVOICE_ID: "Invoice ID", // Invoice identifier
  CURRENT_AGING_BUCKET: "Current Aging Bucket", // Bucket categorization
  PREDICTED_PAYMENT_BUCKET: "Predicted Payment Bucket", // Prediction bucket
  PAYMENT_TERMS: "Payment Terms", // Payment terms
  INVOICE_DUE_DATE: "Invoice Due Date", // Due date
  AMOUNT: "Amount", // Amount field

  // Legacy support - keep these for backward compatibility
  CUSTOMER_NAME: "Customer", // Alias for customer identification
  INVOICE_NUMBER: "Invoice ID", // Alias for invoice
  AGING_BUCKET: "Current Aging Bucket", // Alias for aging bucket
  AGING_BUCKETS: "Current Aging Bucket", // Another alias
  DUE_DATE: "Invoice Due Date", // Alias for due date
  INVOICE_AMOUNT: "Amount", // Alias for amount
  INVOICE_DATE: "Invoice Due Date", // Using due date as main date
  RISK: "Predicted Payment Bucket", // Using prediction as risk indicator
  RISK_SCORE: "Predicted Payment Bucket", // Alias for risk
};

// UPDATED: Field mappings for database columns - simplified for your 7 columns
export const DB_FIELD_MAPPINGS = {
  CUSTOMER: "customer_name",
  INVOICE_ID: "invoice_id", // NEW
  CURRENT_AGING_BUCKET: "current_aging_bucket", // NEW
  PREDICTED_PAYMENT_BUCKET: "predicted_payment_bucket", // NEW
  PAYMENT_TERMS: "payment_terms", // NEW
  INVOICE_DUE_DATE: "invoice_due_date", // NEW
  AMOUNT: "amount",
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

  // Legacy mappings for backward compatibility
  CUSTOMER_NAME: "customer_name",
  INVOICE_NUMBER: "invoice_id",
  AGING_BUCKET: "current_aging_bucket",
  AGING_BUCKETS: "current_aging_bucket",
  DUE_DATE: "invoice_due_date",
  INVOICE_AMOUNT: "amount",
  RISK_SCORE: "predicted_payment_bucket",
  RISK: "predicted_payment_bucket",
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

// UPDATED: Column order for your 7 columns + writeback columns
export const COLUMN_ORDER = {
  CUSTOMER: 0,
  INVOICE_ID: 1,
  CURRENT_AGING_BUCKET: 2,
  PREDICTED_PAYMENT_BUCKET: 3,
  PAYMENT_TERMS: 4,
  INVOICE_DUE_DATE: 5,
  AMOUNT: 6,
  STATUS: 7, // Model Feedback
  COMMENTS: 8, // Comments
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
  EDIT_TIMEOUT: 30000,
  SAVE_DEBOUNCE: 500,
  CONFLICT_CHECK_INTERVAL: 10000,
};

export const PAGE_CHANGE_DELAY = 2000;

// Storage keys
export const STORAGE_KEYS = {
  EDITED_DATA: "qlik_writeback_edited_data",
  USER_PREFERENCES: "qlik_writeback_user_prefs",
  LAST_SAVE_TIME: "qlik_writeback_last_save",
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
