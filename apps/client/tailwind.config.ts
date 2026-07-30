import type { Config } from "tailwindcss";

function themeColor(name: string) {
  return `rgb(var(--color-${name}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      xs: "480px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1366px"
    },
    extend: {
      colors: {
        canvas: themeColor("canvas"),
        panel: themeColor("panel"),
        elevated: themeColor("elevated"),
        line: themeColor("line"),
        muted: themeColor("muted"),
        ink: themeColor("ink"),
        accent: themeColor("accent"),
        aqua: themeColor("aqua"),
        violet: themeColor("violet"),
        amber: themeColor("amber"),
        rose: themeColor("rose")
      },
      boxShadow: {
        soft: "0 20px 50px rgba(0, 0, 0, 0.24)"
      }
    }
  },
  plugins: []
} satisfies Config;
