/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
        /** Object storage for section thumbnails (survives capture-server redeploys). */
        THUMBNAILS?: R2Bucket;
        /** Shared secret the capture server presents to upload thumbnails. */
        THUMBNAILS_TOKEN?: string;
        GITHUB_APP_ID?: string;
        GITHUB_APP_CLIENT_ID?: string;
        GITHUB_APP_CLIENT_SECRET?: string;
        GITHUB_APP_INSTALLATION_ID?: string;
        GITHUB_APP_INSTALLATION_TOKEN?: string;
        GITHUB_APP_PRIVATE_KEY?: string;
        GITHUB_ACCESS_TOKEN?: string;
        OPENAI_API_KEY?: string;
        OPENAI_MODEL?: string;
        CANONICAL_WEBFLOW_SITE_ID?: string;
      };
    };
  }
}
