import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        panel: "#15191d",
        mint: "#4fbf9f",
        coral: "#ef765f",
        amber: "#f3b44e"
      }
    }
  },
  plugins: []
};

export default config;
