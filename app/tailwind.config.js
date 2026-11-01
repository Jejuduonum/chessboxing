/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        chess: 'var(--chess)',
        'chess-ink': 'var(--chess-ink)',
        'chess-soft': 'var(--chess-soft)',
        fit: 'var(--fit)',
        'fit-ink': 'var(--fit-ink)',
        'fit-soft': 'var(--fit-soft)',
        good: 'var(--good)',
        warn: 'var(--warn)',
        target: 'var(--target)',
        'on-accent': 'var(--on-accent)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'sans-serif'],
      },
      maxWidth: { app: '480px' },
    },
  },
  plugins: [],
};
