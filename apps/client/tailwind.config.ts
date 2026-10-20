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
        "accent-ink": themeColor("accent-ink"),
        aqua: themeColor("aqua"),
        violet: themeColor("violet"),
        amber: themeColor("amber"),
        rose: themeColor("rose"),
        teal: themeColor("teal")
      },
      fontFamily: {
        sans: ["'Inter Variable'", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "'Segoe UI'", "sans-serif"]
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem"
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / var(--shadow-near, 0.18)), 0 12px 32px -18px rgb(0 0 0 / var(--shadow-far, 0.5))"
      }
    }
  },
  plugins: []
} satisfies Config;
