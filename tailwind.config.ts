import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#F5A623",      // --color-primary
          primaryHover: "#E09415", // --color-primary-hover
        },
        surface: {
          barLight: "#F8F9FA",   // Friends & Groups bar, light
          barDark: "#1C1C1E",    // Folders bar, dark
          feedLight: "#FFFFFF",  // feed bg, light
          feedDark: "#0A0A0A",   // feed bg, dark
          barSep: "#E5E7EB",     // bar separator, light
          cardDark: "#1C1C1E",   // card bg, dark
        },
        // Feed filter tab + card badge tokens (PRD §11.2a)
        // Use these variables via CSS tokens defined in globals.css
        // Do NOT use these color values directly — reference --color-mine / --color-received
        filtered: {
          all:      "#8E8E93",   // --color-all: neutral grey (All tab)
          mine:     "#F5A623",   // --color-mine: amber (Mine tab + own badge; same as --color-accent)
          received: "#3B82F6",   // --color-received: blue (Received tab + received badge)
        },
      },
      zIndex: {
        bars:    "10",  // --z-bars: Friends strip + Folders bar
        topBar:  "20",  // --z-top-bar: top navigation bar
        fab:     "30",  // --z-fab: floating action button
        modal:   "40",  // --z-modal: card detail modal
        sheet:   "50",  // --z-sheet: bottom sheets
        toast:   "60",  // --z-toast: undo toasts
        overlay: "70",  // --z-overlay: drag overlay
      },
      animation: {
        wobble: "wobble 0.3s ease-in-out infinite",
      },
      keyframes: {
        wobble: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
      },
    },
  },
  plugins: [],
  darkMode: "class",
};

export default config;
