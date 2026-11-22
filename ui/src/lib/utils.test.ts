import { describe, it, expect } from 'vitest';
import { cn, formatBytes, formatUptime, hexToRgb, isValidHex } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('combines simple class names', () => {
      expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');
    });

    it('merges overlapping tailwind classes', () => {
      expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    });

    it('handles conditional falsy values', () => {
      expect(cn('base', false && 'hidden', null, undefined, 'extra')).toBe('base extra');
    });

    it('handles array and object syntax', () => {
      expect(cn(['foo', 'bar'], { baz: true, qux: false })).toBe('foo bar baz');
    });
  });

  describe('formatBytes', () => {
    it('returns "0 B" for 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes correctly', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('formats kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('formats megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1572864, 1)).toBe('1.5 MB');
    });

    it('formats gigabytes and terabytes correctly', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    it('handles negative decimal places by treating them as 0', () => {
      expect(formatBytes(1500, -1)).toBe('1 KB');
    });

    it('respects custom decimal places', () => {
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
    });
  });

  describe('formatUptime', () => {
    it('formats seconds under 60', () => {
      expect(formatUptime(0)).toBe('0s');
      expect(formatUptime(45)).toBe('45s');
      expect(formatUptime(59)).toBe('59s');
    });

    it('formats minutes under 60', () => {
      expect(formatUptime(60)).toBe('1m 0s');
      expect(formatUptime(125)).toBe('2m 5s');
      expect(formatUptime(3599)).toBe('59m 59s');
    });

    it('formats hours', () => {
      expect(formatUptime(3600)).toBe('1h 0m');
      expect(formatUptime(3660)).toBe('1h 1m');
      expect(formatUptime(7320)).toBe('2h 2m');
    });
  });

  describe('hexToRgb', () => {
    it('parses 6-digit hex with hash', () => {
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#38bdf8')).toEqual({ r: 56, g: 189, b: 248 });
    });

    it('parses 6-digit hex without hash', () => {
      expect(hexToRgb('38bdf8')).toEqual({ r: 56, g: 189, b: 248 });
      expect(hexToRgb('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('handles uppercase and mixed case hex', () => {
      expect(hexToRgb('#ABCDEF')).toEqual({ r: 171, g: 205, b: 239 });
    });

    it('returns null for invalid hex inputs', () => {
      expect(hexToRgb('')).toBeNull();
      expect(hexToRgb('123')).toBeNull();
      expect(hexToRgb('#123')).toBeNull();
      expect(hexToRgb('#12345')).toBeNull();
      expect(hexToRgb('#1234567')).toBeNull();
      expect(hexToRgb('#zzzzzz')).toBeNull();
    });
  });

  describe('isValidHex', () => {
    it('returns true for valid 6-digit hex with hash', () => {
      expect(isValidHex('#ffffff')).toBe(true);
      expect(isValidHex('#000000')).toBe(true);
      expect(isValidHex('#38bdf8')).toBe(true);
      expect(isValidHex('#ABCDEF')).toBe(true);
      expect(isValidHex('#1a2B3c')).toBe(true);
    });

    it('returns false for hex without hash', () => {
      expect(isValidHex('ffffff')).toBe(false);
      expect(isValidHex('38bdf8')).toBe(false);
    });

    it('returns false for 3-digit shorthand hex', () => {
      expect(isValidHex('#fff')).toBe(false);
    });

    it('returns false for invalid lengths and characters', () => {
      expect(isValidHex('')).toBe(false);
      expect(isValidHex('#')).toBe(false);
      expect(isValidHex('#12345')).toBe(false);
      expect(isValidHex('#1234567')).toBe(false);
      expect(isValidHex('#gggggg')).toBe(false);
    });
  });
});
