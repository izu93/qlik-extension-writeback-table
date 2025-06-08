// ui/messageRenderer.js
/**
 * Message rendering utility for user notifications
 */

import { MESSAGE_TYPES } from "../utils/constants.js";

export class MessageRenderer {
  constructor() {
    this.activeMessages = new Set();
  }

  /**
   * Show a message to the user
   * @param {string} text - Message text
   * @param {string} type - Message type (success, error, warning, info)
   * @param {HTMLElement} container - Container element (optional)
   * @param {number} duration - Auto-hide duration in milliseconds (0 = no auto-hide)
   */
  showMessage(
    text,
    type = MESSAGE_TYPES.INFO,
    container = null,
    duration = 4000
  ) {
    console.log(`MessageRenderer: Showing ${type} message: ${text}`);

    const message = document.createElement("div");
    message.className = `save-message ${type}`;
    message.textContent = text;

    // Add to active messages set
    this.activeMessages.add(message);

    // Determine where to append the message
    const targetContainer = container
      ? container.querySelector(".writeback-table-container") || container
      : document.body;

    targetContainer.appendChild(message);

    // Auto-remove after duration (if duration > 0)
    if (duration > 0) {
      setTimeout(() => {
        this.removeMessage(message);
      }, duration);
    }

    return message;
  }

  /**
   * Show a processing message that doesn't auto-hide
   * @param {string} text - Message text
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showProcessingMessage(text, container) {
    const message = this.showMessage(text, "processing", container, 0);
    message.innerHTML = `
      <div>${text}</div>
      <div style="font-size: 0.9em; margin-top: 5px;">Real-time sync enabled</div>
    `;
    return message;
  }

  /**
   * Remove a specific message
   * @param {HTMLElement} message - Message element to remove
   */
  removeMessage(message) {
    if (message && message.parentNode) {
      message.parentNode.removeChild(message);
      this.activeMessages.delete(message);
    }
  }

  /**
   * Remove all active messages
   */
  clearAllMessages() {
    this.activeMessages.forEach((message) => {
      this.removeMessage(message);
    });
    this.activeMessages.clear();
  }

  /**
   * Show success message
   * @param {string} text - Message text
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showSuccess(text, container) {
    return this.showMessage(text, MESSAGE_TYPES.SUCCESS, container);
  }

  /**
   * Show error message
   * @param {string} text - Message text
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showError(text, container) {
    return this.showMessage(text, MESSAGE_TYPES.ERROR, container);
  }

  /**
   * Show warning message
   * @param {string} text - Message text
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showWarning(text, container) {
    return this.showMessage(text, MESSAGE_TYPES.WARNING, container);
  }

  /**
   * Show info message
   * @param {string} text - Message text
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showInfo(text, container) {
    return this.showMessage(text, MESSAGE_TYPES.INFO, container);
  }

  /**
   * Show a save result message based on the result object
   * @param {Object} result - Save result object
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showSaveResult(result, container) {
    let message;

    if (result.success) {
      message = this.showSuccess(result.message, container);
    } else {
      if (result.type === MESSAGE_TYPES.WARNING) {
        message = this.showWarning(result.message, container);
      } else {
        message = this.showError(result.message, container);
      }
    }

    // Add additional details if available
    if (result.successCount !== undefined && result.totalCount !== undefined) {
      const details = document.createElement("div");
      details.style.fontSize = "0.9em";
      details.style.marginTop = "5px";
      details.textContent = `Processed ${result.successCount}/${result.totalCount} records`;
      message.appendChild(details);
    }

    return message;
  }

  /**
   * Create a loading spinner message
   * @param {string} text - Loading text
   * @param {HTMLElement} container - Container element
   * @returns {HTMLElement} Message element
   */
  showLoadingMessage(text, container) {
    const message = document.createElement("div");
    message.className = "save-message processing";
    message.innerHTML = `
      <div class="loading-content">
        <div class="mini-spinner"></div>
        <span>${text}</span>
      </div>
    `;

    this.activeMessages.add(message);

    const targetContainer = container
      ? container.querySelector(".writeback-table-container") || container
      : document.body;

    targetContainer.appendChild(message);

    // Add mini spinner styles if not already present
    this.addMiniSpinnerStyles();

    return message;
  }

  /**
   * Add mini spinner styles for loading messages
   */
  addMiniSpinnerStyles() {
    if (document.querySelector("#mini-spinner-styles")) return;

    const style = document.createElement("style");
    style.id = "mini-spinner-styles";
    style.textContent = `
      .loading-content {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .mini-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #ffffff40;
        border-top: 2px solid #ffffff;
        border-radius: 50%;
        animation: miniSpin 1s linear infinite;
      }
      
      @keyframes miniSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Get count of active messages
   * @returns {number} Number of active messages
   */
  getActiveMessageCount() {
    return this.activeMessages.size;
  }

  /**
   * Check if there are any active messages of a specific type
   * @param {string} type - Message type to check for
   * @returns {boolean} Whether there are active messages of that type
   */
  hasActiveMessagesOfType(type) {
    return Array.from(this.activeMessages).some((message) =>
      message.classList.contains(type)
    );
  }
}
