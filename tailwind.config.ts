import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        paper: {
          DEFAULT: "#FAFAF7",
          deep: "#F3F1EA",
          ink: "#111113",
        },
        ink: {
          DEFAULT: "#111113",
          soft: "#2A2A2E",
          muted: "#6B6A64",
          faint: "#A6A49D",
          line: "#E8E6DE",
        },
        accent: {
          DEFAULT: "#4F46E5",
          soft: "#EEF0FF",
          ink: "#1E1B4B",
        },
        brand: {
          amber: "#C89450",
          emerald: "#059669",
          rose: "#E11D48",
        },
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
        "2xl": "32px",
      },
      boxShadow: {
        hairline: "inset 0 0 0 0.5px rgba(17,17,19,0.10)",
        card: "0 1px 0 rgba(17,17,19,0.04), 0 4px 16px -8px rgba(17,17,19,0.08)",
        pop: "0 20px 48px -24px rgba(17,17,19,0.25)",
        glow: "0 0 0 6px rgba(79,70,229,0.08)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 280ms cubic-bezier(.22,1,.36,1) both",
        "pop-in": "pop-in 200ms cubic-bezier(.22,1,.36,1) both",
        shimmer: "shimmer 1.4s linear infinite",
        ticker: "ticker 30s linear infinite",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(.22,1,.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
