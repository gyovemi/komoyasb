/**
 * @fileoverview Client-side input validation utilities for preventing path traversal
 * and parameter injection attacks prior to Tauri IPC execution.
 */

import type { AppError } from '../types/ipc';

/**
 * Result structure returned by validation helpers.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a theme preset name.
 *
 * Theme names must:
 * - Be non-empty and between 1 and 64 characters.
 * - Contain only alphanumeric characters, underscores, hyphens, and spaces (`[a-zA-Z0-9_ -]`).
 * - Contain zero directory separators (`/`, `\`) or traversal tokens (`..`).
 *
 * @param name - Candidate theme preset name.
 * @returns ValidationResult with boolean flag and descriptive error message if invalid.
 */
export function validateThemeName(name: string): ValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Theme name must not be empty.' };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Theme name must not be empty or whitespace.' };
  }

  if (trimmed.length > 64) {
    return { valid: false, error: 'Theme name must not exceed 64 characters.' };
  }

  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    return { valid: false, error: 'Theme name must not contain path traversal tokens or slashes.' };
  }

  const alphanumericRegex = /^[a-zA-Z0-9_ -]+$/;
  if (!alphanumericRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Theme name must contain only alphanumeric characters, spaces, hyphens, and underscores.',
    };
  }

  return { valid: true };
}

/**
 * Validates a filesystem path or wallpaper image location.
 *
 * Checks against:
 * - Path traversal sequences (`..`).
 * - Null bytes and unprintable control characters.
 * - Illegal Windows path characters (`< > " | ? *`).
 *
 * @param path - Filesystem path string.
 * @returns ValidationResult with boolean flag and descriptive error message if invalid.
 */
export function validatePath(path: string): ValidationResult {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'Path must not be empty.' };
  }

  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Path must not be empty or whitespace.' };
  }

  // Prevent directory traversal
  if (/(^|[/\\])\.\.([/\\]|$)/.test(trimmed) || trimmed.includes('..')) {
    return { valid: false, error: 'Path contains illegal traversal sequence (..).' };
  }

  // Check for null bytes or control characters
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(trimmed)) {
    return { valid: false, error: 'Path contains invalid control characters.' };
  }

  // Check for illegal Windows filename/path characters (< > " | ? *)
  if (/[<>"|?*]/.test(trimmed)) {
    return { valid: false, error: 'Path contains illegal Windows characters (< > " | ? *).' };
  }

  // Check colon usage: only valid as Windows drive letter (e.g. C:\)
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex !== -1) {
    if (colonIndex !== 1 || !/^[a-zA-Z]/.test(trimmed)) {
      return { valid: false, error: 'Colon is only permitted as part of a drive letter specification.' };
    }
    if (trimmed.indexOf(':', colonIndex + 1) !== -1) {
      return { valid: false, error: 'Multiple colon characters are not permitted in a path.' };
    }
  }

  return { valid: true };
}

/**
 * Validates a configuration backup snapshot timestamp identifier.
 *
 * Snapshot timestamps must:
 * - Be non-empty and between 1 and 64 characters.
 * - Contain only alphanumeric characters, underscores, and hyphens (`[a-zA-Z0-9_-]`).
 * - Contain zero directory separators (`/`, `\`), traversal tokens (`..`), or null bytes (`\0`).
 *
 * @param timestamp - Candidate snapshot timestamp identifier.
 * @returns ValidationResult with boolean flag and descriptive error message if invalid.
 */
export function validateSnapshotTimestamp(timestamp: string): ValidationResult {
  if (!timestamp || typeof timestamp !== 'string') {
    return { valid: false, error: 'Snapshot timestamp must not be empty.' };
  }

  const trimmed = timestamp.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Snapshot timestamp must not be empty or whitespace.' };
  }

  if (trimmed.length > 64) {
    return { valid: false, error: 'Snapshot timestamp must not exceed 64 characters.' };
  }

  if (
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    return {
      valid: false,
      error: 'Snapshot timestamp must not contain path traversal tokens, slashes, or null bytes.',
    };
  }

  const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
  if (!alphanumericRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Snapshot timestamp must contain only alphanumeric characters, underscores, and hyphens.',
    };
  }

  return { valid: true };
}

/**
 * Asserts that a theme preset name is valid, throwing an AppError if validation fails.
 *
 * @param name - Theme preset name.
 * @throws {AppError} If validation fails.
 */
export function assertValidThemeName(name: string): void {
  const result = validateThemeName(name);
  if (!result.valid) {
    const error: AppError = {
      code: 'VALIDATION_FAILED',
      message: result.error || 'Invalid theme preset name.',
    };
    throw error;
  }
}

/**
 * Asserts that a filesystem path is valid, throwing an AppError if validation fails.
 *
 * @param path - Filesystem path string.
 * @throws {AppError} If validation fails.
 */
export function assertValidPath(path: string): void {
  const result = validatePath(path);
  if (!result.valid) {
    const error: AppError = {
      code: 'VALIDATION_FAILED',
      message: result.error || 'Invalid filesystem path.',
    };
    throw error;
  }
}

/**
 * Asserts that a backup snapshot timestamp is valid, throwing an AppError if validation fails.
 *
 * @param timestamp - Candidate snapshot timestamp identifier.
 * @throws {AppError} If validation fails.
 */
export function assertValidSnapshotTimestamp(timestamp: string): void {
  const result = validateSnapshotTimestamp(timestamp);
  if (!result.valid) {
    const error: AppError = {
      code: 'VALIDATION_FAILED',
      message: result.error || 'Invalid snapshot timestamp.',
    };
    throw error;
  }
}

