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
        // cool-neutral / Pressed Sage
        paper: {
          DEFAULT: "#F7F8FA",
          deep: "#EEF1F4",
          ink: "#14181F",
        },
        ink: {
          DEFAULT: "#14181F",
          soft: "#3A4150",
          muted: "#5A6473",
          faint: "#8A93A1",
          line: "#E4E8EE",
        },
        accent: {
          DEFAULT: "#1F7A52",
          soft: "#E0F0E8",
          ink: "#155637",
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
        md: "8px",
        lg: "14px",
        xl: "24px",
        "2xl": "32px",
      },
      boxShadow: {
        hairline: "inset 0 0 0 0.5px rgba(20,24,31,0.10)",
        card: "0 1px 2px rgba(20,24,31,0.05), 0 1px 3px rgba(20,24,31,0.05)",
        pop: "0 2px 6px rgba(20,24,31,0.05), 0 8px 24px rgba(20,24,31,0.08)",
        glow: "0 0 0 6px rgba(31,122,82,0.08)",
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
