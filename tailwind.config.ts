import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./client/index.html", "./client/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
