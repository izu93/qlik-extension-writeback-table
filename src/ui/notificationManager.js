// ui/notificationManager.js
/**
 * User notification and activity tracking manager
 * UPDATED: Uses customer names instead of account IDs
 */

export class NotificationManager {
  constructor(messageRenderer) {
    this.messageRenderer = messageRenderer;
    this.activeEditors = new Map(); // customerName -> {user, timestamp}
    this.recentChanges = new Map(); // customerName -> {user, timestamp, type}
    this.currentUser = null;
    this.sessionId = null;
    this.checkInterval = null;
  }

  /**
   * Initialize notification system
   */
  initialize(currentUser) {
    this.currentUser = currentUser;
    this.sessionId = window.sessionStorage.getItem("qlik_session_id");
    console.log(`NotificationManager initialized for user: ${currentUser}`);
  }

  /**
   * Start monitoring for user activity
   */
  startMonitoring() {
    // Check for other users' activity every 10 seconds
    this.checkInterval = setInterval(() => {
      this.checkForUserActivity();
    }, 10000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * Track when user starts editing a field
   * @param {string} customerName - Customer name
   * @param {string} fieldId - Field identifier
   */
  trackEditStart(customerName, fieldId) {
    const key = `${customerName}-${fieldId}`;
    this.activeEditors.set(key, {
      user: this.currentUser,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
    });

    console.log(
      `Edit started: ${this.currentUser} editing ${customerName}-${fieldId}`
    );
  }

  /**
   * Track when user stops editing a field
   * @param {string} customerName - Customer name
   * @param {string} fieldId - Field identifier
   */
  trackEditEnd(customerName, fieldId) {
    const key = `${customerName}-${fieldId}`;
    this.activeEditors.delete(key);

    console.log(
      `Edit ended: ${this.currentUser} stopped editing ${customerName}-${fieldId}`
    );
  }

  /**
   * Check for other users' recent activity
   */
  async checkForUserActivity() {
    try {
      // For now, just log that we're checking
      console.log("Checking for user activity...");
    } catch (error) {
      console.warn("Failed to check user activity:", error);
    }
  }

  /**
   * Show conflict warning
   * @param {string} customerName - Customer name
   * @param {string} otherUser - Other user's name
   * @param {string} otherTimestamp - Timestamp of other user's edit
   */
  showConflictWarning(customerName, otherUser, otherTimestamp) {
    const message = `Conflict detected! User "${otherUser}" modified customer "${customerName}" at ${new Date(
      otherTimestamp
    ).toLocaleTimeString()}. Your changes may overwrite theirs.`;

    return this.messageRenderer.showMessage(message, "warning", null, 10000);
  }

  /**
   * Show save success with user info
   * @param {number} savedCount - Number of records saved
   * @param {number} totalCount - Total number of records
   */
  showSaveSuccess(savedCount, totalCount) {
    const message = `Successfully saved ${savedCount}/${totalCount} records as ${this.currentUser}`;
    this.messageRenderer.showMessage(message, "success", null, 3000);
  }

  /**
   * Check for conflicts before saving
   * @param {Object} editedData - Object containing edited field values
   * @returns {Promise<Array>} Array of conflicts found
   */
  async checkForConflicts(editedData) {
    // For now, return empty array - we'll enhance this later
    return [];
  }

  /**
   * Track when a customer record is modified
   * @param {string} customerName - Customer name
   * @param {string} changeType - Type of change (status, comments, etc.)
   */
  trackCustomerChange(customerName, changeType) {
    this.recentChanges.set(customerName, {
      user: this.currentUser,
      timestamp: new Date().toISOString(),
      type: changeType,
      sessionId: this.sessionId,
    });

    console.log(
      `Customer change tracked: ${this.currentUser} modified ${customerName} (${changeType})`
    );
  }

  /**
   * Get active editors for a specific customer
   * @param {string} customerName - Customer name to check
   * @returns {Array} List of active editors for this customer
   */
  getActiveEditorsForCustomer(customerName) {
    const editors = [];
    for (const [key, editorInfo] of this.activeEditors.entries()) {
      if (key.startsWith(`${customerName}-`)) {
        editors.push({
          field: key.split("-")[1], // Extract field name
          ...editorInfo,
        });
      }
    }
    return editors;
  }

  /**
   * Check if a customer is currently being edited by someone else
   * @param {string} customerName - Customer name to check
   * @returns {boolean} True if customer is being edited by another user
   */
  isCustomerBeingEditedByOthers(customerName) {
    const editors = this.getActiveEditorsForCustomer(customerName);
    return editors.some(
      (editor) =>
        editor.user !== this.currentUser && editor.sessionId !== this.sessionId
    );
  }

  /**
   * Show notification when another user is editing the same customer
   * @param {string} customerName - Customer name
   * @param {Array} otherEditors - List of other editors
   */
  showConcurrentEditWarning(customerName, otherEditors) {
    const otherUsers = otherEditors
      .filter((editor) => editor.user !== this.currentUser)
      .map((editor) => editor.user);

    if (otherUsers.length > 0) {
      const userList = otherUsers.join(", ");
      const message = `👥 Customer "${customerName}" is currently being edited by: ${userList}`;

      return this.messageRenderer.showMessage(message, "info", null, 5000);
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopMonitoring();
    this.activeEditors.clear();
    this.recentChanges.clear();
  }
}
