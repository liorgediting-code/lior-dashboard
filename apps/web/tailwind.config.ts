import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        winner: "#16a34a",
        suspect: "#d97706",
        kill: "#dc2626",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "pulse-soft": "pulse-soft 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
