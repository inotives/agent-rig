import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(root, "src");
mkdirSync(resolve(root, "dist"), { recursive: true });
chmodSync(resolve(root, "dist/index.js"), 0o755);
execFileSync(resolve(root, "node_modules/.bin/tailwindcss"), ["-c", resolve(root, "tailwind.config.cjs"), "-i", resolve(sourceRoot, "ui/core/ui.css"), "-o", resolve(root, "dist/ui.css"), "--minify"], { stdio: "inherit" });
copyFileSync(resolve(sourceRoot, "ui/core/ui.html"), resolve(root, "dist/index.html"));
