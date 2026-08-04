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
    },
  },
  plugins: [],
};

export default config;
