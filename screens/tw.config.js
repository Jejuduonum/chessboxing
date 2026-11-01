// Tailwind (Play CDN) config shared by every mock. Colours point at the
// CSS variables in app.css, so dark/light themes swap from one place.
tailwind.config = {
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
        fit: 'var(--fit)',
        'fit-ink': 'var(--fit-ink)',
        good: 'var(--good)',
        warn: 'var(--warn)',
        target: 'var(--target)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'sans-serif'],
      },
    },
  },
};
