# Webflow Builder Visual QA

Standalone Playwright service for comparing the original exported HTML preview against the imported Webflow page.

This service is intentionally separate from Webflow Cloud and Cloudflare because Playwright needs a Node runtime with browser binaries.

## Local

```bash
cd visual-qa
npm install
npm run dev
```

## Render

- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm start`

Environment:

```bash
PORT=10000
VISUAL_QA_ALLOWED_HOSTS=preview.example.com,example.webflow.io
VISUAL_QA_ARTIFACT_BASE_URL=https://your-render-service.onrender.com
VISUAL_QA_ARTIFACT_DIR=/tmp/webflow-builder-visual-qa
VISUAL_QA_MAX_VIEWPORTS=3
VISUAL_QA_NAVIGATION_TIMEOUT_MS=45000
```

Extension env:

```bash
VITE_VISUAL_QA_BASE_URL=https://your-render-service.onrender.com
```
