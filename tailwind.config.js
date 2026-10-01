/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#4f46e5',
        secondary: '#64748b',
        ink: '#0f172a',
        secret: '#7c3aed',
      },
    },
  },
  plugins: [],
};
