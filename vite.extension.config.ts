import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  envDir: process.cwd(),
  plugins: [react()],
  root: path.resolve(process.cwd(), "extension"),
  resolve: {
    alias: {
      "@wfb/shared": path.resolve(process.cwd(), "packages/shared/src"),
      "@wfb/backend-core": path.resolve(process.cwd(), "packages/backend-core/src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
