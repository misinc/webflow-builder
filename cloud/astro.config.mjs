import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  session: {
    driver: "memory"
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  })
});
