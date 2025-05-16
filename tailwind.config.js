/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      backgroundColor: {
        'background': 'var(--background)',
        'foreground': 'var(--foreground)',
      },
      textColor: {
        'background': 'var(--background)',
        'foreground': 'var(--foreground)',
      },
    },
  },
  plugins: [],
}