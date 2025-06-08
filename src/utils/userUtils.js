// utils/userUtils.js
/**
 * Utilities for user identification and management
 */

import ENV from "../config/env.js";

/**
 * Get current username from various Qlik contexts
 * @param {Object} galaxy - Galaxy object from Qlik
 * @returns {Promise<string>} Username
 */
export async function getCurrentUsername(galaxy) {
  console.log("Starting username retrieval...");

  try {
    // Method 1: For Qlik Cloud - Extract tenant from URL
    const hostname = window.location.hostname;
    console.log("DEBUG: Current hostname:", hostname);

    if (
      hostname.includes(".qlikcloud.com") ||
      hostname.includes(".qliksense.com")
    ) {
      const parts = hostname.split(".");
      if (parts.length >= 3) {
        const tenantName = parts[0];
        console.log("Extracted tenant name from URL:", tenantName);
        return tenantName;
      }
    }

    // Method 2: For localhost - try Qlik methods
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      console.log("DEBUG: Running in localhost environment");

      // Try qlik.getGlobal() for localhost
      if (window.qlik && window.qlik.getGlobal) {
        try {
          const global = await window.qlik.getGlobal();
          if (global && global.getAuthenticatedUser) {
            const user = await global.getAuthenticatedUser();
            if (user && (user.qName || user.userId || user.name)) {
              const username = user.qName || user.userId || user.name;
              console.log("Got username from qlik.getGlobal():", username);
              return username;
            }
          }
        } catch (globalError) {
          console.log("DEBUG: qlik.getGlobal() failed:", globalError);
        }
      }

      // Check galaxy for localhost
      if (typeof galaxy !== "undefined" && galaxy) {
        const galaxyUserPaths = [
          () => galaxy.session?.config?.user,
          () => galaxy.session?.user,
          () => galaxy.user,
          () => galaxy.sense?.user,
          () => galaxy.hostConfig?.user,
        ];

        for (const getUser of galaxyUserPaths) {
          try {
            const userInfo = getUser();
            if (userInfo) {
              const username =
                typeof userInfo === "string"
                  ? userInfo
                  : userInfo.name ||
                    userInfo.email ||
                    userInfo.userId ||
                    userInfo.user;

              if (username && typeof username === "string") {
                console.log("Got username from galaxy:", username);
                return username;
              }
            }
          } catch (pathError) {
            // Silent fail, try next path
          }
        }
      }
    }

    // Method 3: Fallback username generation
    if (hostname.includes(".qlikcloud.com")) {
      const fallbackUser = `qlik_cloud_user_${Date.now().toString().slice(-6)}`;
      console.log("Using Qlik Cloud fallback:", fallbackUser);
      return fallbackUser;
    } else {
      const fallbackUser = `qlik_user_${Date.now().toString().slice(-6)}`;
      console.log("Using fallback username:", fallbackUser);
      return fallbackUser;
    }
  } catch (error) {
    console.error("Error in getCurrentUsername:", error);
    return `error_user_${Date.now()}`;
  }
}

/**
 * Get or prompt for username with caching
 * @param {Object} galaxy - Galaxy object from Qlik
 * @returns {Promise<string>} Username
 */
export async function getOrPromptUsername(galaxy) {
  // Check if we already have a stored username
  let storedUsername = localStorage.getItem(ENV.STORAGE_KEYS.USERNAME);

  if (!storedUsername) {
    // Try automatic detection
    storedUsername = await getCurrentUsername(galaxy);

    // Store the detected username
    localStorage.setItem(ENV.STORAGE_KEYS.USERNAME, storedUsername);
    console.log("Stored username:", storedUsername);
  } else {
    console.log("Using cached username:", storedUsername);
  }

  return storedUsername;
}

/**
 * Clear stored username (for logout scenarios)
 */
export function clearStoredUsername() {
  localStorage.removeItem(ENV.STORAGE_KEYS.USERNAME);
  console.log("Cleared stored username");
}

/**
 * Generate consistent app ID from model
 * @param {Object} model - Qlik model object
 * @returns {string} Consistent app ID
 */
export function getConsistentAppId(model) {
  // Try to get app ID from URL parameters first
  const urlParams = new URLSearchParams(window.location.search);
  const appIdFromUrl = urlParams.get("app") || urlParams.get("appid");

  if (appIdFromUrl) {
    return `qlik_app_${appIdFromUrl}`;
  }

  // Extract from engine_url parameter (your case)
  const engineUrl = urlParams.get("engine_url");
  if (engineUrl) {
    const appIdMatch = engineUrl.match(/\/app\/([a-f0-9-]+)/);
    if (appIdMatch) {
      return `qlik_app_${appIdMatch[1]}`;
    }
  }

  // Try to get from full URL path
  const url = window.location.href;
  const appIdMatch = url.match(/\/app\/([a-f0-9-]+)/);
  if (appIdMatch) {
    return `qlik_app_${appIdMatch[1]}`;
  }

  // Extract from any part of the URL that looks like a Qlik app ID
  const qlikAppIdMatch = url.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/
  );
  if (qlikAppIdMatch) {
    return `qlik_app_${qlikAppIdMatch[1]}`;
  }

  // Dynamic fallback using hostname + timestamp (but stable within session)
  if (!window._qlik_session_app_id) {
    const hostname = window.location.hostname.replace(/\./g, "_");
    const sessionId = Date.now();
    window._qlik_session_app_id = `qlik_app_${hostname}_${sessionId}`;
  }

  return window._qlik_session_app_id;
}
