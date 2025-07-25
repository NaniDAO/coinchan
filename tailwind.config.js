const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
        display: ["var(--font-display)", ...defaultTheme.fontFamily.serif],
      },
      backgroundColor: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      textColor: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      colors: {
        diamond: {
          pink: "var(--diamond-pink)",
          blue: "var(--diamond-blue)",
          yellow: "var(--diamond-yellow)",
          green: "var(--diamond-green)",
          orange: "var(--diamond-orange)",
          purple: "var(--diamond-purple)",
        },
      },
      animation: {
        marquee: "marquee 30s linear infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
    },
  },
  plugins: [],
};
