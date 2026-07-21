import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07080D",
        panel: "#11131A",
        line: "#252A36",
        mint: "#62F0B4",
        sky: "#59B8FF",
        rose: "#FF6F91"
      },
      boxShadow: {
        glow: "0 18px 70px rgba(98, 240, 180, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
