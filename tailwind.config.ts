import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        "bg-primary": "var(--bg-primary)",
        "bg-secondary": "var(--bg-secondary)",
        surface: {
          DEFAULT: "var(--surface)",
          secondary: "var(--bg-secondary)",
          hover: "var(--surface-hover)",
          active: "var(--surface-active)",
          elevated: "var(--surface-elevated)",
        },
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-muted": "var(--text-muted)",
        "text-disabled": "var(--text-disabled)",
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        primary: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          modern: "var(--accent)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          border: "var(--accent-border)",
          text: "var(--accent-text)",
          supporting: "var(--accent-supporting)",
        },
        success: {
          DEFAULT: "var(--success)",
          soft: "var(--success-soft)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
        },
        error: {
          DEFAULT: "var(--error)",
          soft: "var(--error-soft)",
        },
        danger: {
          DEFAULT: "var(--error)",
          soft: "var(--error-soft)",
        },
        info: {
          DEFAULT: "var(--info)",
          soft: "var(--info-soft)",
        },
        focus: "var(--focus)",
        nav: {
          bg: "var(--nav-bg)",
          "bg-secondary": "var(--nav-bg-secondary)",
          primary: "var(--nav-text-primary)",
          secondary: "var(--nav-text-secondary)",
          border: "var(--nav-border)",
          hover: "var(--nav-hover)",
          active: "var(--nav-active)",
          "active-text": "var(--nav-active-text)",
        },
        sidebar: {
          bg: "var(--nav-bg)",
          primary: "var(--nav-text-primary)",
          secondary: "var(--nav-text-secondary)",
          icon: "var(--nav-text-secondary)",
          hover: "var(--nav-hover)",
          "active-bg": "var(--nav-active)",
          "active-text": "var(--nav-active-text)",
          "active-icon": "#FFFFFF",
          heading: "var(--sidebar-headings)",
          border: "var(--nav-border)",
        },
        shopify: {
          DEFAULT: "#96bf48",
          dark: "#5e8e3e",
        },
        theme: {
          primary: "var(--accent)",
          secondary: "var(--accent-hover)",
          accent: "var(--accent)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
