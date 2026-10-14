/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./src/ui/core/ui.html", "./src/ui/pages/task-board/*.ts", "./src/ui/pages/phase-list/*.ts", "./src/ui/pages/task-board/graph/*.ts"],
  theme: {
    extend: {
      keyframes: {
        "bubble-pop": { from: { transform: "scale(0)" }, "65%": { transform: "scale(1.3)" }, to: { transform: "scale(1)" } }
      },
      animation: {
        "bubble-pop": "bubble-pop 520ms ease-out var(--stagger, 0ms) backwards"
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
