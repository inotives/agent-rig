import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(resolve(root, "dist"), { recursive: true });
execFileSync(resolve(root, "node_modules/.bin/tailwindcss"), ["-c", resolve(root, "tailwind.config.cjs"), "-i", resolve(root, "src/ui.css"), "-o", resolve(root, "dist/ui.css"), "--minify"], { stdio: "inherit" });
copyFileSync(resolve(root, "src/ui.html"), resolve(root, "dist/index.html"));
