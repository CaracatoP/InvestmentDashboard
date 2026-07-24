import type { Config } from "tailwindcss";

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
        canvas: "#070809",
        panel: "#0d0f10",
        elevated: "#141617",
        line: "#232728",
        muted: "#8b9491",
        ink: "#f4f7f5",
        accent: "#22c55e",
        aqua: "#38bdf8",
        violet: "#a78bfa",
        amber: "#f59e0b",
        rose: "#fb7185"
      },
      boxShadow: {
        soft: "0 20px 50px rgba(0, 0, 0, 0.24)"
      }
    }
  },
  plugins: []
} satisfies Config;
