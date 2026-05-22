import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  envDir: process.cwd(),
  plugins: [react()],
  root: path.resolve(process.cwd(), "extension"),
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
