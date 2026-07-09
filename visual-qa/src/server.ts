import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express from "express";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { PNG } from "pngjs";
import { z } from "zod";

const visualQaViewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const visualQaCompareRequestSchema = z.object({
  originalUrl: z.string().url(),
  webflowUrl: z.string().url(),
  selector: z.string().min(1).optional(),
  threshold: z.number().min(0).max(1).default(0.12),
  viewports: z.array(visualQaViewportSchema).min(1).default([
    { name: "desktop", width: 1440, height: 1200 },
    { name: "tablet", width: 991, height: 1200 },
    { name: "mobile", width: 390, height: 1200 }
  ])
});

interface VisualQaViewportResult {
  name: string;
  width: number;
  height: number;
  mismatchRatio: number;
  passed: boolean;
  originalScreenshot: string;
  webflowScreenshot: string;
  diffScreenshot: string;
  notes: string[];
}

interface VisualQaCompareResponse {
  generatedAt: string;
  originalUrl: string;
  webflowUrl: string;
  selector?: string;
  threshold: number;
  passed: boolean;
  averageMismatchRatio: number;
  results: VisualQaViewportResult[];
  warnings: string[];
}

const app = express();
const artifactDir =
  process.env.VISUAL_QA_ARTIFACT_DIR ?? "/tmp/webflow-builder-visual-qa";
const maxViewports = Number.parseInt(process.env.VISUAL_QA_MAX_VIEWPORTS ?? "3", 10);
const navigationTimeoutMs = Number.parseInt(
  process.env.VISUAL_QA_NAVIGATION_TIMEOUT_MS ?? "45000",
  10
);

app.use(express.json({ limit: "128kb" }));
app.use("/artifacts", express.static(artifactDir));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/visual-qa/compare", async (request, response) => {
  try {
    const input = visualQaCompareRequestSchema.parse(request.body);
    assertUrlAllowed(input.originalUrl);
    assertUrlAllowed(input.webflowUrl);

    const runId = crypto.randomUUID();
    const runDir = path.join(artifactDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    try {
      const viewports = input.viewports.slice(0, maxViewports);
      const results: VisualQaViewportResult[] = [];
      const warnings: string[] = [];

      if (input.viewports.length > viewports.length) {
        warnings.push(`Only the first ${viewports.length} viewport(s) were compared.`);
      }

      for (const viewport of viewports) {
        const result = await compareViewport({
          runId,
          runDir,
          artifactBaseUrl: getArtifactBaseUrl(request),
          originalUrl: input.originalUrl,
          webflowUrl: input.webflowUrl,
          selector: input.selector,
          threshold: input.threshold,
          viewport,
          browser
        });
        results.push(result);
      }

      const averageMismatchRatio =
        results.reduce((sum, result) => sum + result.mismatchRatio, 0) /
        Math.max(results.length, 1);
      const payload: VisualQaCompareResponse = {
        generatedAt: new Date().toISOString(),
        originalUrl: input.originalUrl,
        webflowUrl: input.webflowUrl,
        selector: input.selector,
        threshold: input.threshold,
        passed: results.every((result) => result.passed),
        averageMismatchRatio,
        results,
        warnings
      };

      response.json(payload);
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual QA failed.";
    response.status(/invalid|missing|not allowed|blocked/i.test(message) ? 400 : 500).json({
      error: message
    });
  }
});

async function compareViewport(params: {
  runId: string;
  runDir: string;
  artifactBaseUrl: string;
  originalUrl: string;
  webflowUrl: string;
  selector?: string;
  threshold: number;
  viewport: { name: string; width: number; height: number };
  browser: Browser;
}): Promise<VisualQaViewportResult> {
  const originalPage = await params.browser.newPage({ viewport: params.viewport });
  const webflowPage = await params.browser.newPage({ viewport: params.viewport });

  try {
    const [originalScreenshot, webflowScreenshot] = await Promise.all([
      captureScreenshot(originalPage, params.originalUrl, params.selector),
      captureScreenshot(webflowPage, params.webflowUrl, params.selector)
    ]);

    const comparison = comparePngBuffers(originalScreenshot, webflowScreenshot);
    const originalName = `original-${params.viewport.name}.png`;
    const webflowName = `webflow-${params.viewport.name}.png`;
    const diffName = `diff-${params.viewport.name}.png`;

    await Promise.all([
      fs.writeFile(path.join(params.runDir, originalName), originalScreenshot),
      fs.writeFile(path.join(params.runDir, webflowName), webflowScreenshot),
      fs.writeFile(path.join(params.runDir, diffName), PNG.sync.write(comparison.diff))
    ]);

    const notes = buildNotes({
      mismatchRatio: comparison.mismatchRatio,
      threshold: params.threshold,
      originalHeight: comparison.originalHeight,
      webflowHeight: comparison.webflowHeight,
      selector: params.selector
    });

    return {
      name: params.viewport.name,
      width: params.viewport.width,
      height: params.viewport.height,
      mismatchRatio: comparison.mismatchRatio,
      passed: comparison.mismatchRatio <= params.threshold,
      originalScreenshot: artifactUrl(params.artifactBaseUrl, params.runId, originalName),
      webflowScreenshot: artifactUrl(params.artifactBaseUrl, params.runId, webflowName),
      diffScreenshot: artifactUrl(params.artifactBaseUrl, params.runId, diffName),
      notes
    };
  } finally {
    await Promise.all([originalPage.close(), webflowPage.close()]);
  }
}

async function captureScreenshot(
  page: Page,
  url: string,
  selector?: string
): Promise<Buffer> {
  await page.goto(url, {
    waitUntil: "networkidle",
    timeout: navigationTimeoutMs
  });
  await page.waitForTimeout(500);

  if (!selector) {
    return page.screenshot({ fullPage: true });
  }

  const locator = page.locator(selector).first();
  const count = await locator.count();
  if (count === 0) {
    throw new Error(`Selector not found: ${selector}`);
  }
  return locator.screenshot();
}

function comparePngBuffers(originalBuffer: Buffer, webflowBuffer: Buffer) {
  const original = PNG.sync.read(originalBuffer);
  const webflow = PNG.sync.read(webflowBuffer);
  const width = Math.min(original.width, webflow.width);
  const height = Math.min(original.height, webflow.height);
  const originalCropped = cropPng(original, width, height);
  const webflowCropped = cropPng(webflow, width, height);
  const diff = new PNG({ width, height });
  const mismatchPixels = pixelmatch(
    originalCropped.data,
    webflowCropped.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );

  return {
    diff,
    originalHeight: original.height,
    webflowHeight: webflow.height,
    mismatchRatio: mismatchPixels / Math.max(width * height, 1)
  };
}

function cropPng(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) {
    return source;
  }

  const cropped = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceStart = (y * source.width) << 2;
    const targetStart = (y * width) << 2;
    source.data.copy(cropped.data, targetStart, sourceStart, sourceStart + (width << 2));
  }
  return cropped;
}

function buildNotes(input: {
  mismatchRatio: number;
  threshold: number;
  originalHeight: number;
  webflowHeight: number;
  selector?: string;
}): string[] {
  const notes: string[] = [];
  if (input.mismatchRatio > input.threshold) {
    notes.push(
      "Visual mismatch is above the threshold; check spacing, image crop, grid/flex layout, and typography."
    );
  }
  const heightDelta =
    Math.abs(input.originalHeight - input.webflowHeight) /
    Math.max(input.originalHeight, input.webflowHeight, 1);
  if (heightDelta > 0.15) {
    notes.push(
      "Screenshot heights differ substantially; check missing content, collapsed layout, section padding, or selector scope."
    );
  }
  if (input.selector) {
    notes.push(`Compared only the first element matching ${input.selector}.`);
  }
  return notes;
}

function getArtifactBaseUrl(request: express.Request): string {
  const configured = process.env.VISUAL_QA_ARTIFACT_BASE_URL?.replace(/\/+$/, "");
  if (configured) {
    return configured;
  }
  return `${request.protocol}://${request.get("host")}`;
}

function artifactUrl(baseUrl: string, runId: string, filename: string): string {
  return `${baseUrl}/artifacts/${encodeURIComponent(runId)}/${encodeURIComponent(filename)}`;
}

function assertUrlAllowed(value: string): void {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP(S) URLs are supported.");
  }

  const host = url.hostname.toLowerCase();
  const allowedHosts = (process.env.VISUAL_QA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    throw new Error(`Host is not allowed: ${host}`);
  }

  const allowPrivateHosts = process.env.VISUAL_QA_ALLOW_PRIVATE_HOSTS === "true";
  if (!allowPrivateHosts && isPrivateHost(host)) {
    throw new Error(`Private-network host is blocked: ${host}`);
  }
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local")) {
    return true;
  }
  if (/^10\./.test(host) || /^127\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  const match172 = host.match(/^172\.(\d+)\./);
  return Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
}

const port = Number.parseInt(process.env.PORT ?? "8788", 10);
app.listen(port, () => {
  console.log(`Visual QA service listening on ${port}`);
});
