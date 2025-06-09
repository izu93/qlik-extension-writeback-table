// ui/notificationManager.js
/**
 * User notification and activity tracking manager
 */

export class NotificationManager {
  constructor(messageRenderer) {
    this.messageRenderer = messageRenderer;
    this.activeEditors = new Map(); // accountId -> {user, timestamp}
    this.recentChanges = new Map(); // accountId -> {user, timestamp, type}
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
   */
  trackEditStart(accountId, fieldId) {
    const key = `${accountId}-${fieldId}`;
    this.activeEditors.set(key, {
      user: this.currentUser,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
    });

    console.log(
      `Edit started: ${this.currentUser} editing ${accountId}-${fieldId}`
    );
  }

  /**
   * Track when user stops editing a field
   */
  trackEditEnd(accountId, fieldId) {
    const key = `${accountId}-${fieldId}`;
    this.activeEditors.delete(key);

    console.log(
      `Edit ended: ${this.currentUser} stopped editing ${accountId}-${fieldId}`
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
   */
  showConflictWarning(accountId, otherUser, otherTimestamp) {
    const message = `⚠️ Conflict detected! User "${otherUser}" modified account ${accountId} at ${new Date(
      otherTimestamp
    ).toLocaleTimeString()}. Your changes may overwrite theirs.`;

    return this.messageRenderer.showMessage(message, "warning", null, 10000);
  }

  /**
   * Show save success with user info
   */
  showSaveSuccess(savedCount, totalCount) {
    const message = `✅ Successfully saved ${savedCount}/${totalCount} records as ${this.currentUser}`;
    this.messageRenderer.showMessage(message, "success", null, 3000);
  }

  /**
   * Check for conflicts before saving
   */
  async checkForConflicts(editedData) {
    // For now, return empty array - we'll enhance this later
    return [];
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
