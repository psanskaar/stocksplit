import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a1a",
        foreground: "#e2e8f0",
        card: {
          DEFAULT: "#12122a",
          foreground: "#e2e8f0",
          border: "#1e1e3a",
        },
        primary: {
          DEFAULT: "#6366f1",
          foreground: "#ffffff",
          hover: "#4f46e5",
        },
        pt: {
          DEFAULT: "#3b82f6",
          glow: "rgba(59, 130, 246, 0.4)",
        },
        yt: {
          DEFAULT: "#22c55e",
          glow: "rgba(34, 197, 94, 0.4)",
        },
        muted: {
          DEFAULT: "#1e1e3a",
          foreground: "#94a3b8",
        },
        border: "#1e1e3a",
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      boxShadow: {
        "pt-glow": "0 0 25px -5px rgba(59, 130, 246, 0.35)",
        "yt-glow": "0 0 25px -5px rgba(34, 197, 94, 0.35)",
        "primary-glow": "0 0 25px -5px rgba(99, 102, 241, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
