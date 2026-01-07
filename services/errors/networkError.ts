/**
 * Network error handling utilities for extracting and formatting Axios errors.
 * Provides user-friendly messages and detailed technical logging.
 */

import { AxiosError } from 'axios';

export type NetworkErrorCode =
  | 'NETWORK_UNREACHABLE'
  | 'CONNECTION_REFUSED'
  | 'TIMEOUT'
  | 'DNS_FAILURE'
  | 'SERVER_ERROR'
  | 'CLIENT_ERROR'
  | 'UNKNOWN';

export interface NetworkErrorInfo {
  /** User-friendly message to display in UI */
  userMessage: string;
  /** Technical details for logging */
  technicalDetails: string;
  /** Error code for categorization */
  code: NetworkErrorCode;
  /** Whether a retry might succeed */
  isRetryable: boolean;
}

/**
 * Check if an error is an Axios error.
 */
function isAxiosError(error: unknown): error is AxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

/**
 * Handle server responses (when we got an HTTP status code).
 */
function handleServerResponse(
  status: number,
  technicalDetails: string
): NetworkErrorInfo {
  if (status >= 500) {
    return {
      userMessage: 'The server encountered an error. Please try again later.',
      technicalDetails,
      code: 'SERVER_ERROR',
      isRetryable: true,
    };
  }

  if (status === 408) {
    return {
      userMessage: 'Request timed out. Please try again.',
      technicalDetails,
      code: 'TIMEOUT',
      isRetryable: true,
    };
  }

  // 4xx errors are client errors, generally not retryable without changes
  return {
    userMessage: `Request failed (${status}). Please try again.`,
    technicalDetails,
    code: 'CLIENT_ERROR',
    isRetryable: false,
  };
}

/**
 * Handle network errors (when no response was received).
 */
function handleNoResponse(
  code: string | undefined,
  timeout: number | undefined,
  technicalDetails: string
): NetworkErrorInfo {
  switch (code) {
    case 'ECONNABORTED':
    case 'ERR_TIMEOUT':
      return {
        userMessage: `Request timed out after ${(timeout || 30000) / 1000}s. The server may be busy or unreachable.`,
        technicalDetails,
        code: 'TIMEOUT',
        isRetryable: true,
      };

    case 'ERR_NETWORK':
      return {
        userMessage: 'Unable to connect to server. Please check your network connection.',
        technicalDetails,
        code: 'NETWORK_UNREACHABLE',
        isRetryable: true,
      };

    case 'ECONNREFUSED':
      return {
        userMessage: 'Connection refused. The server may be offline.',
        technicalDetails,
        code: 'CONNECTION_REFUSED',
        isRetryable: true,
      };

    case 'ENOTFOUND':
      return {
        userMessage: 'Server not found. Please check the server address.',
        technicalDetails,
        code: 'DNS_FAILURE',
        isRetryable: false,
      };

    default:
      return {
        userMessage: 'Network error. Please check your connection and try again.',
        technicalDetails,
        code: 'UNKNOWN',
        isRetryable: true,
      };
  }
}

/**
 * Extract error info from an Axios error.
 */
function extractAxiosError(error: AxiosError): NetworkErrorInfo {
  const { code, message, config, response, request } = error;

  // Build technical details for logging
  const url = config?.url || 'unknown';
  const baseURL = config?.baseURL || 'unknown';
  const fullUrl = `${baseURL}${url}`;
  const timeout = config?.timeout;

  const technicalDetails = [
    `Axios Error: ${message}`,
    `Code: ${code || 'none'}`,
    `URL: ${fullUrl}`,
    `Timeout: ${timeout}ms`,
    response ? `Response Status: ${response.status}` : 'No response received',
    request ? 'Request was sent' : 'Request was not sent',
  ].join('\n');

  // Determine error type and user message
  if (response) {
    // Server responded with error status
    return handleServerResponse(response.status, technicalDetails);
  }

  if (request) {
    // Request was sent but no response received
    return handleNoResponse(code, timeout, technicalDetails);
  }

  // Request was never sent (config error)
  return {
    userMessage: 'Failed to send request. Please check your connection.',
    technicalDetails,
    code: 'UNKNOWN',
    isRetryable: true,
  };
}

/**
 * Extract comprehensive error information from any error type.
 * Provides both user-friendly messages and technical logging details.
 */
export function extractNetworkError(error: unknown): NetworkErrorInfo {
  // Handle Axios errors
  if (isAxiosError(error)) {
    return extractAxiosError(error);
  }

  // Handle standard Error
  if (error instanceof Error) {
    return {
      userMessage: error.message,
      technicalDetails: `Error: ${error.message}\nStack: ${error.stack}`,
      code: 'UNKNOWN',
      isRetryable: false,
    };
  }

  // Handle unknown errors
  return {
    userMessage: 'An unexpected error occurred',
    technicalDetails: `Unknown error type: ${JSON.stringify(error)}`,
    code: 'UNKNOWN',
    isRetryable: false,
  };
}

/**
 * Log a network error with full context for debugging.
 */
export function logNetworkError(
  context: string,
  error: unknown,
  errorInfo?: NetworkErrorInfo
): void {
  const info = errorInfo || extractNetworkError(error);

  console.error(`[${context}] Network Error:`, {
    userMessage: info.userMessage,
    code: info.code,
    isRetryable: info.isRetryable,
    technicalDetails: info.technicalDetails,
  });
}
