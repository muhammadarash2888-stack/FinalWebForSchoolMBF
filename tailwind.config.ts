import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand-color, #4f46e5)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
