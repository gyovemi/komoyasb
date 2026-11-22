import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          primary: 'var(--color-bg-primary, #0f141c)',
          secondary: 'var(--color-bg-secondary, #1a202c)',
          surface: 'var(--color-bg-surface, #232b3b)',
        },
        foreground: {
          primary: 'var(--color-fg-primary, #f8fafc)',
          secondary: 'var(--color-fg-secondary, #cbd5e1)',
          muted: 'var(--color-fg-muted, #64748b)',
        },
        accent: {
          DEFAULT: 'var(--color-accent, #38bdf8)',
          secondary: 'var(--color-accent-secondary, #818cf8)',
        },
        border: {
          active: 'var(--color-border-active, #38bdf8)',
          inactive: 'var(--color-border-inactive, #334155)',
        },
        status: {
          error: 'var(--color-error, #f43f5e)',
          warning: 'var(--color-warning, #f59e0b)',
          success: 'var(--color-success, #10b981)',
          info: 'var(--color-info, #0ea5e9)',
        },
      },
      borderRadius: {
        lg: 'var(--radius, 8px)',
        md: 'calc(var(--radius, 8px) - 2px)',
        sm: 'calc(var(--radius, 8px) - 4px)',
      },
    },
  },
  plugins: [],
} satisfies Config;
