/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/ui/core/ui.html", "./src/ui/pages/task-board/index.ts", "./src/ui/pages/task-board/graph/*.ts"],
  theme: {
    extend: {
      keyframes: {
        "timeline-rail": { from: { transform: "scaleY(0)" }, to: { transform: "scaleY(1)" } },
        "timeline-entry": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "timeline-node": { from: { opacity: "0", transform: "scale(0.4)" }, "70%": { opacity: "1", transform: "scale(1.12)" }, to: { opacity: "1", transform: "scale(1)" } },
        "timeline-pulse": { from: { boxShadow: "0 0 0 0 oklch(var(--btn-color, var(--p)) / 0.55)" }, to: { boxShadow: "0 0 0 14px oklch(var(--btn-color, var(--p)) / 0)" } }
      },
      animation: {
        "timeline-rail": "timeline-rail 600ms ease-out backwards",
        "timeline-entry": "timeline-entry 400ms ease-out var(--stagger, 0ms) backwards",
        "timeline-node": "timeline-node 350ms ease-out calc(var(--stagger, 0ms) + 100ms) backwards",
        "timeline-node-newest": "timeline-node 350ms ease-out calc(var(--stagger, 0ms) + 100ms) backwards, timeline-pulse 1400ms ease-out calc(var(--stagger, 0ms) + 600ms) 3"
      }
    }
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark"],
    darkTheme: "dark",
    logs: false
  }
};
