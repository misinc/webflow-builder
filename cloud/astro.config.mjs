import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const cloudNodeModulesDir = fileURLToPath(new URL("./node_modules/", import.meta.url));

export default defineConfig({
  output: "server",
  vite: {
    resolve: {
      alias: {
        "@wfb/shared": `${rootDir}/packages/shared/src`,
        "@wfb/backend-core": `${rootDir}/packages/backend-core/src`,
        zod: `${cloudNodeModulesDir}/zod/index.js`
      }
    }
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  })
});
