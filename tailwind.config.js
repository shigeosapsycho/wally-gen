/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0d0d12',
        card: '#15151c',
        'card-2': '#1a1a22',
        border: '#23232c',
        muted: '#8a8a98',
        text: '#e6e6ed',
        accent: '#7c6cf6',
        'accent-dim': '#5b4fc4',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
