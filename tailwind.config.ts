import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jbmono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // blueprint drafting-paper
        paper: {
          DEFAULT: "#F2F0EB",
          deep: "#EBE8E1",
          ink: "#0A0A0A",
        },
        ink: {
          DEFAULT: "#0A0A0A",
          soft: "#2A2A2A",
          muted: "#555555",
          faint: "#888888",
          line: "rgba(10,10,10,0.12)",
        },
        accent: {
          DEFAULT: "#1854A0",
          soft: "rgba(24,84,160,0.08)",
          ink: "#0E3D7A",
        },
        brand: {
          amber: "#B88420",
          emerald: "#3A7D44",
          rose: "#A83232",
        },
        // Landing-D palette (ported from the standalone marketing app, which
        // ran Tailwind v4 `@theme`). Namespaced `lp-` on purpose: the donor's
        // bare `ink` / `paper` / `base` names collide with the blueprint
        // tokens above, and `text-base` is a font size here.
        lp: {
          base: "#15171a",
          ink: "#112220",
          navy: "#0f172a",
          band: "#e6ebf2",
          lime: "#d1ff19",
          gold: "#ffdd3c",
          hotpink: "#fa2c8e",
          grape: "#7c3aed",
          toggle: "#30cf43",
          paper: "#f6f8fa",
          blurple: "#635bff",
          // our blueprint blue, available to the landing as an accent
          blue: "#1854A0",
          blueDark: "#0E3D7A",
          sky: "#4A9EFF",
        },
      },
      borderRadius: {
        xs: "2px",
        sm: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        "2xl": "2px",
      },
      boxShadow: {
        hairline: "inset 0 0 0 0.5px rgba(10,10,10,0.12)",
        card: "3px 3px 0 rgba(10,10,10,0.06)",
        pop: "4px 4px 0 rgba(10,10,10,0.08)",
        glow: "0 0 0 6px rgba(24,84,160,0.08)",
        // Landing-D soft elevations (the blueprint `card` above is a hard
        // offset shadow, so the marketing page carries its own).
        "lp-mock": "0 2px 6px rgb(15 23 42 / 0.04), 0 30px 60px -12px rgb(15 23 42 / 0.16)",
        "lp-tile": "0 1px 3px rgb(15 23 42 / 0.1), 0 12px 24px -8px rgb(15 23 42 / 0.18)",
        "lp-card": "0 1px 2px rgb(15 23 42 / 0.05), 0 16px 40px -12px rgb(15 23 42 / 0.25)",
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
        "fade-up": "fade-up 280ms cubic-bezier(.4,0,.2,1) both",
        "pop-in": "pop-in 200ms cubic-bezier(.4,0,.2,1) both",
        shimmer: "shimmer 1.4s linear infinite",
        ticker: "ticker 30s linear infinite",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(.4,0,.2,1)",
      },
    },
  },
  plugins: [],
};

export default config;
