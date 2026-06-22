export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', 'bg-soft': 'var(--bg-soft)',
        silver: 'var(--silver)', 'silver-dark': 'var(--silver-dark)', 'silver-light': 'var(--silver-light)',
        yellow: 'var(--yellow)', 'yellow-dark': 'var(--yellow-dark)', 'yellow-soft': 'var(--yellow-soft)',
        clap: { text: 'var(--text)', soft: 'var(--text-soft)' },
        ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', info: 'var(--info)',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '12px', '2xl': '18px' },
      boxShadow: { card: '0 2px 10px rgba(20,20,20,.06)', pop: '0 8px 32px rgba(20,20,20,.12)' },
    },
  },
  plugins: [],
}