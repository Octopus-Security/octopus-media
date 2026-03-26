import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:          '#0d0d0d',
        surface:     '#111111',
        'surface-2': '#161616',
        'surface-3': '#1a1a1a',
        border:      '#1e1e1e',
        'border-2':  '#2a2a2a',
        text:        '#e8e8e8',
        'text-body': '#d4d4d4',
        muted:       '#aaaaaa',
        accent:      '#2ecc71',
        'accent-h':  '#5df59a',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};

export default config;
