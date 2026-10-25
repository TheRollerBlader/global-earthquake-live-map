/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        seismic: {
          dark: '#0a0d14',
          card: '#111726',
          border: '#1e293b',
          accent: '#38bdf8',
          shallow: '#ef4444',     // < 70 km
          intermediate: '#f59e0b', // 70 - 300 km
          deep: '#3b82f6',        // > 300 km
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', 'monospace'],
      }
    },
  },
  plugins: [],
}
