/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces (clean light palette)
        bg: '#ffffff',
        surface: '#ffffff',
        'surface-2': '#f6f7f9',
        'surface-3': '#eef0f3',
        border: '#e5e8ec',
        'border-light': '#d7dbe1',
        // Text
        fg: '#1b2330',
        muted: '#5b6472',
        faint: '#98a1ae',
        // Status (readable on white)
        ok: '#15935f',
        warn: '#b47812',
        danger: '#d23b47',
        info: '#2563eb',
        'ok-dim': 'rgba(21,147,95,0.10)',
        'warn-dim': 'rgba(180,120,18,0.12)',
        'danger-dim': 'rgba(210,59,71,0.10)',
        'info-dim': 'rgba(37,99,235,0.09)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: { xl: '0.75rem' },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        pulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
