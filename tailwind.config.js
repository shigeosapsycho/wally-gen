/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Theme switching is driven by adding/removing `.dark` on <html>; useTheme
  // also writes data-theme for CSS selectors that prefer the attribute form.
  darkMode: 'class',
  theme: {
    extend: {
      // Chrome colors flow through CSS variables (rgb triples) so the same
      // Tailwind class adapts to whichever palette is active.
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        'card-2': 'rgb(var(--c-card-2) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        input: 'rgb(var(--c-input) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-dim': 'rgb(var(--c-accent-dim) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 2s linear infinite',
      },
    },
  },
  plugins: [],
}
