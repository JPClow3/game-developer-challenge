/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pirate: {
          dark: '#0f172a',
          navy: '#1e293b',
          wood: '#854d0e',
          gold: '#eab308',
          sand: '#fef08a',
          parchment: '#fef3c7',
        },
      },
      fontFamily: {
        pirate: ['PirateFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
