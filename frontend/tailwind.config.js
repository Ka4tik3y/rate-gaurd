/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — cream paper, dusty and warm
        bg: '#efe8d8',
        surface: '#f7f2e6',
        'surface-2': '#ece4d2',
        'surface-3': '#e3d9c4',
        border: '#d6cbb3',
        'border-light': '#c9bc9f',
        // Text — warm ink
        fg: '#2f2a22',
        muted: '#6b6252',
        faint: '#9d9381',
        // Status — faded, low-saturation (olive / ochre / brick / slate)
        ok: '#5f6f45',
        warn: '#9a7334',
        danger: '#9b4a3a',
        info: '#4f5a63',
        // Primary action — dark ink, not a bright accent
        ink: '#3a342b',
        'ok-dim': 'rgba(95,111,69,0.12)',
        'warn-dim': 'rgba(154,115,52,0.13)',
        'danger-dim': 'rgba(155,74,58,0.11)',
        'info-dim': 'rgba(79,90,99,0.10)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        display: ['"Libre Baskerville"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: { xl: '0.375rem', lg: '0.25rem', md: '0.1875rem' },
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
