import type { Config } from "tailwindcss";

/**
 * Pulse design language (redesign: "Heard. Counted. Answered."):
 * teal accent, ink text, warm paper background, Inter type, 14px minimum.
 * Remapping `slate` and `pulse` restyles every page without touching them.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        // Nothing smaller than 14px, so all text stays readable.
        xs: ["0.875rem", { lineHeight: "1.25rem" }],
      },
      colors: {
        ink: "#13222E",
        coral: "#F08A5D",
        pulse: {
          50: "#E3F1EF",
          500: "#2C8C86",
          600: "#0B6E69",
          700: "#085954",
        },
        slate: {
          50: "#F6F7F4",
          100: "#EEF0EC",
          200: "#E2E5E0",
          300: "#C9CEC6",
          400: "#6B7684",
          500: "#5B6776",
          600: "#3F4B57",
          700: "#2A3642",
          800: "#1C2A36",
          900: "#13222E",
        },
      },
      borderRadius: {
        xl: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
