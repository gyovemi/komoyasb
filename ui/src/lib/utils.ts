import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines conditional class names and merges overlapping Tailwind utility classes.
 *
 * @param inputs - Class names, expressions, objects, or arrays to combine.
 * @returns Merged class string with conflicts resolved by tailwind-merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a raw byte count into a human-readable file size string with metric units.
 *
 * @param bytes - Numeric byte count to format.
 * @param decimals - Number of fractional decimal places to retain (default: 2).
 * @returns Formatted byte string (e.g. "12.50 MB", "0 B").
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const unitBase = 1024;
  const decimalPlaces = decimals < 0 ? 0 : decimals;
  const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(unitBase));
  const scaledSize = parseFloat((bytes / Math.pow(unitBase, unitIndex)).toFixed(decimalPlaces));
  return `${scaledSize} ${sizeUnits[unitIndex]}`;
}

/**
 * Converts elapsed seconds into an ergonomic duration representation (seconds, minutes, or hours).
 *
 * @param seconds - Elapsed process or service uptime in whole seconds.
 * @returns Human-friendly uptime string (e.g. "45s", "12m 30s", "3h 15m").
 */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Parses a standard 6-digit hex color string into discrete red, green, and blue integer channels.
 *
 * @param hex - Hexadecimal color code with or without leading hash (e.g. "#38bdf8" or "38bdf8").
 * @returns RGB channel object or null if hex format is invalid.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const matchResult = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return matchResult
    ? {
        r: parseInt(matchResult[1], 16),
        g: parseInt(matchResult[2], 16),
        b: parseInt(matchResult[3], 16),
      }
    : null;
}

/**
 * Validates whether a given string is a strict 6-digit hexadecimal color code beginning with `#`.
 *
 * @param hex - Color code candidate to validate.
 * @returns True if input matches the `#RRGGBB` pattern, false otherwise.
 */
export function isValidHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}
