import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  build: { target: "es2022", assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 900 },
  envPrefix: ["VITE_"],
  test: { include: ["src/**/*.test.ts"] },
});
