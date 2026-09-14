/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        fetta: {
          bg: '#06070a',
          surface: '#0c0d12',
          card: '#111319',
          border: 'rgba(255, 255, 255, 0.1)',
          accent: '#e096ff',
        }
      },
      width: {
        'fluid-card': 'clamp(300px, 92vw, 1100px)',
      },
      minHeight: {
        'fluid-hero': 'clamp(500px, 60vh, 720px)',
      }
    },
  },
  plugins: [],
}
