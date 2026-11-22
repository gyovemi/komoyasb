import { describe, it, expect } from 'vitest';
import {
  validateThemeName,
  validatePath,
  assertValidThemeName,
  assertValidPath,
} from './validation';

describe('Client-Side Validation Utilities', () => {
  describe('validateThemeName', () => {
    it('accepts valid alphanumeric, hyphenated, and underscored names', () => {
      expect(validateThemeName('nord').valid).toBe(true);
      expect(validateThemeName('catppuccin-mocha').valid).toBe(true);
      expect(validateThemeName('tokyo_night_123').valid).toBe(true);
    });

    it('accepts names with spaces, including shipped themes (BUG-02)', () => {
      expect(validateThemeName('Tokyo Night Dark').valid).toBe(true);
      expect(validateThemeName('Tokyo Night Light').valid).toBe(true);
      expect(validateThemeName('Catppuccin Mocha').valid).toBe(true);
      expect(validateThemeName('custom theme 1').valid).toBe(true);
    });

    it('rejects empty, null, or whitespace-only names', () => {
      expect(validateThemeName('').valid).toBe(false);
      expect(validateThemeName('   ').valid).toBe(false);
    });

    it('rejects names with path traversal tokens or slashes', () => {
      expect(validateThemeName('../evil').valid).toBe(false);
      expect(validateThemeName('foo/bar').valid).toBe(false);
      expect(validateThemeName('foo\\bar').valid).toBe(false);
    });

    it('rejects names with special punctuation or shell meta-characters', () => {
      expect(validateThemeName('theme;rm -rf').valid).toBe(false);
      expect(validateThemeName('theme$env').valid).toBe(false);
      expect(validateThemeName('theme<script>').valid).toBe(false);
      expect(validateThemeName('theme|pipe').valid).toBe(false);
    });

    it('assertValidThemeName accepts valid theme names with spaces', () => {
      expect(() => assertValidThemeName('Tokyo Night Dark')).not.toThrow();
    });

    it('assertValidThemeName throws AppError on failure', () => {
      expect(() => assertValidThemeName('../../hack')).toThrowError();
    });
  });

  describe('validatePath', () => {
    it('accepts valid absolute and relative Windows paths', () => {
      expect(validatePath('C:\\Users\\user\\Pictures\\wall.png').valid).toBe(true);
      expect(validatePath('wallpapers/dark.jpg').valid).toBe(true);
      expect(validatePath('D:\\assets\\bg.jpeg').valid).toBe(true);
    });

    it('rejects empty or whitespace-only paths', () => {
      expect(validatePath('').valid).toBe(false);
      expect(validatePath('   ').valid).toBe(false);
    });

    it('rejects path traversal attempts (..)', () => {
      expect(validatePath('../../Windows/System32').valid).toBe(false);
      expect(validatePath('C:\\photos\\..\\..\\secret.txt').valid).toBe(false);
    });

    it('rejects illegal Windows filename characters (< > " | ? *)', () => {
      expect(validatePath('C:\\test<bad>.png').valid).toBe(false);
      expect(validatePath('C:\\test|bad.png').valid).toBe(false);
      expect(validatePath('C:\\test?bad.png').valid).toBe(false);
      expect(validatePath('C:\\test*bad.png').valid).toBe(false);
    });

    it('assertValidPath throws AppError on failure', () => {
      expect(() => assertValidPath('../traversal')).toThrowError();
    });
  });
});
