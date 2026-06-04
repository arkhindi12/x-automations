/**
 * Centralized error messages for the application
 * Use these constants instead of hardcoded strings for consistency
 */

export const ERROR_MESSAGES = {
  // Generic errors
  UNKNOWN_ERROR: "An unknown error occurred",
  NETWORK_ERROR: "Network error occurred. Please check your connection.",
  TIMEOUT_ERROR: "Request timed out. Please try again.",
  
  // Authentication errors
  AUTH_FAILED: "Authentication failed",
  INVALID_CREDENTIALS: "Invalid credentials provided",
  CREDENTIAL_VALIDATION_FAILED: "Credential validation failed",
  COOKIES_REQUIRED: "Please paste cookies exported from EditThisCookie before testing",
  MISSING_REQUIRED_FIELDS: "Please complete all required fields before testing",
  
  // Save/Update/Delete operations
  SAVE_FAILED: "Failed to save",
  UPDATE_FAILED: "Failed to update",
  DELETE_FAILED: "Failed to delete",
  LOAD_FAILED: "Failed to load data",
  
  // Specific operations
  EXTRACT_URL_FAILED: "Failed to extract URL",
  ADD_MEDIA_FAILED: "Failed to add media",
  LOAD_SETTINGS_FAILED: "Failed to load settings",
  SAVE_SETTINGS_FAILED: "Failed to save settings",
  SAVE_SEO_FAILED: "Failed to save SEO settings",
  LOAD_CHARTS_FAILED: "Failed to load charts",
  LOAD_STATUS_FAILED: "Failed to fetch status",
  LOAD_HISTORY_FAILED: "Failed to fetch history",
  RESET_STATUS_FAILED: "Failed to reset status",
  DOWNLOAD_FAILED: "Download failed",
  
  // Proxy errors
  LOAD_PROXIES_FAILED: "Failed to load proxies from 9Proxy",
  NO_PROXIES_AVAILABLE: "9Proxy returned no proxies for the current filter",
  
  // File upload errors
  INVALID_FILE_TYPE: "Only .zip files are allowed",
  FILE_UPLOAD_FAILED: "File upload failed",
  
  // Validation errors
  INVALID_INPUT: "Invalid input provided",
  REQUIRED_FIELD: "This field is required",
} as const;

/**
 * Helper function to get error message from response
 */
export function getErrorMessage(error: unknown, fallback: string = ERROR_MESSAGES.UNKNOWN_ERROR): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  if (error && typeof error === "object" && "error" in error) {
    return String(error.error);
  }
  
  return fallback;
}

/**
 * Helper function to create error with custom message
 */
export function createError(message: string, details?: unknown): Error {
  const error = new Error(message);
  if (details && import.meta.env.DEV) {
    console.error("Error details:", details);
  }
  return error;
}
