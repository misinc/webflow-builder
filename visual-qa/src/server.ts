import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import express from "express";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { PNG } from "pngjs";
import { z } from "zod";
import { BREAKPOINTS, captureElement, findSectionCandidates, preparePage } from "./extract.js";
import {
  capturedSectionToClipboardPayload,
  combineSections,
  type SectionCaptureInput
} from "./payload.js";

const execFileAsync = promisify(execFile);

// Render caches node_modules and skips postinstall, so the Playwright browser
// binary can be missing at runtime. Self-heal: install Chromium on demand and
// cache the in-flight promise so concurrent requests share one install. This
// keeps the service working regardless of how the deploy's build command is set.
let chromiumReady: Promise<void> | null = null;
function ensureChromium(): Promise<void> {
  if (!chromiumReady) {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve("playwright/package.json");
    const cliPath = path.join(path.dirname(pkgJsonPath), "cli.js");
    console.warn("[visual-qa] Ensuring Chromium is installed…");
    chromiumReady = execFileAsync(process.execPath, [cliPath, "install", "chromium"], {
      maxBuffer: 64 * 1024 * 1024
    })
      .then(() => {
        console.warn("[visual-qa] Chromium ready.");
      })
      .catch((error) => {
        console.error("[visual-qa] Chromium install failed", error);
        chromiumReady = null; // allow a later request to retry
      });
  }
  return chromiumReady;
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Executable doesn't exist|playwright install/i.test(message)) {
      console.warn("[visual-qa] Chromium missing — installing on demand…");
      await ensureChromium();
      return await chromium.launch({ headless: true });
    }
    throw error;
  }
}

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

// CORS — the extension (webflow.io iframe / localhost dev) calls this service
// cross-origin. Reflect the origin and answer preflight.
app.use((request, response, next) => {
  response.header("Access-Control-Allow-Origin", request.headers.origin ?? "*");
  response.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.header("Access-Control-Allow-Headers", "Content-Type");
  response.header("Vary", "Origin");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "8mb" }));
app.use("/artifacts", express.static(artifactDir));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

// --- Paste-from-URL playground (computed-style extraction trial) ---------
// Renders a real page in Chrome, captures browser-computed styles for a
// section, and returns a Webflow clipboard payload — bypassing the static
// CSS resolver entirely. Trial UI at GET /playground.

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const playgroundViewport = { width: 1440, height: 900 };

app.get("/playground", (_request, response) => {
  response.sendFile(path.join(publicDir, "playground.html"));
});

const playgroundScanSchema = z.object({ url: z.string().url() });

app.post("/playground/scan", async (request, response) => {
  try {
    const input = playgroundScanSchema.parse(request.body);
    assertUrlAllowed(input.url);

    const runId = crypto.randomUUID();
    const runDir = path.join(artifactDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage({ viewport: playgroundViewport });
      await preparePage(page, input.url, navigationTimeoutMs);
      const candidates = await findSectionCandidates(page);
      const artifactBaseUrl = getArtifactBaseUrl(request);

      const results = [];
      for (const [index, candidate] of candidates.entries()) {
        const filename = `candidate-${index}.png`;
        let screenshot: string | null = null;
        try {
          await page
            .locator(candidate.selector)
            .first()
            .screenshot({ path: path.join(runDir, filename), timeout: 8000 });
          screenshot = artifactUrl(artifactBaseUrl, runId, filename);
        } catch {
          // A candidate that cannot be screenshotted is still selectable.
        }
        results.push({ ...candidate, screenshot });
      }
      response.json({ url: input.url, candidates: results });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playground scan failed.";
    response
      .status(/invalid|missing|not allowed|blocked|not found/i.test(message) ? 400 : 500)
      .json({ error: message });
  }
});

// Clipboard inspector: capture a real Webflow Designer copy so its `variants`
// (per-breakpoint) encoding can be reverse-engineered. Saves the raw payload
// server-side and returns a summary of the styles/variants shape.
const playgroundInspectSchema = z.object({
  flavors: z.record(z.string(), z.string())
});

// A nested tag + class-name outline of a pasted @webflow/XscpData payload — so
// we can LEARN a real component's structure (e.g. Relume navbars) rather than
// inventing our own. `&class` marks a combo class.
function outlineFromClipboard(flavors: Record<string, string>): string | null {
  const json =
    flavors["application/json"] ??
    Object.values(flavors).find((value) => value.trim().startsWith("{"));
  if (!json) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const nodes: any[] = parsed?.payload?.nodes ?? [];
  const styles: any[] = parsed?.payload?.styles ?? [];
  if (nodes.length === 0) return null;

  const styleById = new Map(styles.map((s) => [s._id, s]));
  const nodeById = new Map(nodes.map((n) => [n._id, n]));
  const childIds = new Set<string>();
  for (const node of nodes) {
    for (const child of node.children ?? []) childIds.add(child);
  }
  const roots = nodes.filter((n) => !childIds.has(n._id));
  const lines: string[] = [];
  const render = (id: string, depth: number): void => {
    const node = nodeById.get(id);
    if (!node) return;
    const classNames = (node.classes ?? []).map((cid: string) => {
      const style = styleById.get(cid);
      if (!style) return cid;
      return style.comb === "&" ? `&${style.name}` : style.name;
    });
    const tag = node.tag || node.type || "?";
    const displayName = node.data?.displayName ? ` "${node.data.displayName}"` : "";
    const text = node.text && node.v ? ` — “${String(node.v).slice(0, 48)}”` : "";
    const classes = classNames.length ? ` .${classNames.join(" .")}` : "";
    lines.push(`${"  ".repeat(depth)}${tag}${classes}${displayName}${text}`);
    for (const child of node.children ?? []) render(child, depth + 1);
  };
  for (const root of roots) render(root._id, 0);
  return lines.join("\n");
}

app.post("/playground/inspect", async (request, response) => {
  try {
    const input = playgroundInspectSchema.parse(request.body);
    const runId = crypto.randomUUID();
    const runDir = path.join(artifactDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    // Persist every flavor verbatim so nothing is lost to truncation.
    await fs.writeFile(
      path.join(runDir, "clipboard.json"),
      JSON.stringify(input.flavors, null, 2)
    );

    const jsonFlavor =
      input.flavors["application/json"] ??
      Object.values(input.flavors).find((value) => value.trim().startsWith("{"));

    const outline = outlineFromClipboard(input.flavors);
    if (outline) {
      await fs.writeFile(path.join(runDir, "outline.txt"), outline);
    }

    const summary: {
      savedPath: string;
      totalChars: number;
      styleCount: number | null;
      stylesWithVariants: number;
      variantKeys: string[];
      sampleStylesWithVariants: unknown[];
      outline: string | null;
      parseError?: string;
    } = {
      savedPath: path.join(runDir, "clipboard.json"),
      totalChars: Object.values(input.flavors).reduce((sum, value) => sum + value.length, 0),
      styleCount: null,
      stylesWithVariants: 0,
      variantKeys: [],
      sampleStylesWithVariants: [],
      outline
    };

    if (jsonFlavor) {
      try {
        const parsed = JSON.parse(jsonFlavor);
        const styles: Array<Record<string, unknown>> = parsed?.payload?.styles ?? [];
        summary.styleCount = styles.length;
        const variantKeys = new Set<string>();
        for (const style of styles) {
          const variants = (style.variants ?? {}) as Record<string, unknown>;
          const keys = Object.keys(variants);
          if (keys.length > 0) {
            summary.stylesWithVariants += 1;
            keys.forEach((key) => variantKeys.add(key));
            if (summary.sampleStylesWithVariants.length < 4) {
              summary.sampleStylesWithVariants.push({
                name: style.name,
                styleLess: style.styleLess,
                variants
              });
            }
          }
        }
        summary.variantKeys = [...variantKeys];
        // Also drop a focused file with just the styles array for easy reading.
        await fs.writeFile(
          path.join(runDir, "styles.json"),
          JSON.stringify(styles, null, 2)
        );
      } catch (error) {
        summary.parseError = error instanceof Error ? error.message : "Could not parse JSON flavor.";
      }
    } else {
      summary.parseError = "No JSON clipboard flavor found in the paste.";
    }

    console.log(
      `[inspect] saved ${summary.totalChars} chars to ${summary.savedPath} — ` +
        `${summary.styleCount ?? "?"} styles, ${summary.stylesWithVariants} with variants, ` +
        `keys: ${summary.variantKeys.join(", ") || "(none)"}`
    );
    response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clipboard inspect failed.";
    response.status(/invalid|missing/i.test(message) ? 400 : 500).json({ error: message });
  }
});

// The most recently inspected clipboard structures — so pasted components
// (Relume navbars) can be fetched directly instead of copied back by hand.
app.get("/playground/inspect/recent", async (request, response) => {
  try {
    const limit = Math.min(Number.parseInt(String(request.query.limit ?? "10"), 10) || 10, 25);
    const entries = await fs.readdir(artifactDir, { withFileTypes: true }).catch(() => []);
    const found: Array<{ runId: string; at: number; outline: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const outlinePath = path.join(artifactDir, entry.name, "outline.txt");
      try {
        const stat = await fs.stat(outlinePath);
        const outline = await fs.readFile(outlinePath, "utf8");
        found.push({ runId: entry.name, at: stat.mtimeMs, outline });
      } catch {
        // No outline for this run — skip.
      }
    }
    found.sort((a, b) => b.at - a.at);
    response.json({ count: found.length, items: found.slice(0, limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not list inspections.";
    response.status(500).json({ error: message });
  }
});

const playgroundExtractSchema = z.object({
  url: z.string().url(),
  selector: z.string().min(1),
  label: z.string().max(120).optional(),
  kind: z.string().optional(),
  styleGuideMode: z.boolean().optional()
});

app.post("/playground/extract", async (request, response) => {
  try {
    const input = playgroundExtractSchema.parse(request.body);
    assertUrlAllowed(input.url);

    const runId = crypto.randomUUID();
    const runDir = path.join(artifactDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage({ viewport: playgroundViewport });
      await preparePage(page, input.url, navigationTimeoutMs);

      const screenshotName = "original.png";
      await page
        .locator(input.selector)
        .first()
        .screenshot({ path: path.join(runDir, screenshotName), timeout: 15_000 });

      const capture = await captureElement(page, input.selector);
      const label = input.label ?? `Pasted from URL — ${input.selector}`;
      const result = capturedSectionToClipboardPayload({
        tree: capture.tree,
        breakpointStyles: capture.breakpointStyles,
        breakpointKeys: BREAKPOINTS.map((breakpoint) => breakpoint.key),
        sectionName: input.label,
        kind: input.kind,
        label
      });

      response.json({
        payloadJson: JSON.stringify(result.payload),
        stats: result.stats,
        warnings: [...capture.warnings, ...result.warnings],
        screenshot: artifactUrl(getArtifactBaseUrl(request), runId, screenshotName)
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playground extract failed.";
    response
      .status(/invalid|missing|not allowed|blocked|not found|too large/i.test(message) ? 400 : 500)
      .json({ error: message });
  }
});

const playgroundExtractBatchSchema = z.object({
  url: z.string().url(),
  sections: z
    .array(
      z.object({
        selector: z.string().min(1),
        label: z.string().max(120).optional(),
        kind: z.string().optional()
      })
    )
    .min(1)
    .max(30),
  styleGuideMode: z.boolean().optional(),
  existingStyles: z
    .array(z.object({ className: z.string(), styleId: z.string() }))
    .optional()
});

app.post("/playground/extract-batch", async (request, response) => {
  try {
    const input = playgroundExtractBatchSchema.parse(request.body);
    assertUrlAllowed(input.url);

    const runId = crypto.randomUUID();
    const runDir = path.join(artifactDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const browser = await launchBrowser();
    try {
      const page = await browser.newPage({ viewport: playgroundViewport });
      await preparePage(page, input.url, navigationTimeoutMs);
      const artifactBaseUrl = getArtifactBaseUrl(request);
      const breakpointKeys = BREAKPOINTS.map((breakpoint) => breakpoint.key);

      const captured: SectionCaptureInput[] = [];
      const perSection: Array<{ selector: string; screenshot: string | null; warnings: string[] }> = [];

      for (const [index, section] of input.sections.entries()) {
        // Screenshot at the base viewport before captureElement resizes it.
        await page.setViewportSize(playgroundViewport);
        let screenshot: string | null = null;
        try {
          const filename = `section-${index}.png`;
          await page
            .locator(section.selector)
            .first()
            .screenshot({ path: path.join(runDir, filename), timeout: 12_000 });
          screenshot = artifactUrl(artifactBaseUrl, runId, filename);
        } catch {
          // capture still proceeds without a thumbnail
        }
        const capture = await captureElement(page, section.selector);
        captured.push({
          tree: capture.tree,
          breakpointStyles: capture.breakpointStyles,
          breakpointKeys,
          sectionName: section.label,
          kind: section.kind,
          label: section.label ?? `Pasted from URL — ${section.selector}`
        });
        perSection.push({ selector: section.selector, screenshot, warnings: capture.warnings });
      }

      const existingStyles = input.existingStyles ?? [];
      const result =
        captured.length === 1
          ? capturedSectionToClipboardPayload(captured[0], existingStyles)
          : combineSections(captured, { existingStyles });

      response.json({
        payloadJson: JSON.stringify(result.payload),
        stats: result.stats,
        warnings: [...new Set([...perSection.flatMap((s) => s.warnings), ...result.warnings])],
        perSection: perSection.map((s) => ({ selector: s.selector, screenshot: s.screenshot }))
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playground batch extract failed.";
    response
      .status(/invalid|missing|not allowed|blocked|not found|too large/i.test(message) ? 400 : 500)
      .json({ error: message });
  }
});

app.post("/visual-qa/compare", async (request, response) => {
  try {
    const input = visualQaCompareRequestSchema.parse(request.body);
    assertUrlAllowed(input.originalUrl);
    assertUrlAllowed(input.webflowUrl);

    const runId = crypto.randomUUID();
    const runDir = path.join(artifactDir, runId);
    await fs.mkdir(runDir, { recursive: true });

    const browser = await launchBrowser();
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
  // Warm the browser install during boot (non-blocking) so the first scan
  // isn't delayed by an on-demand install.
  void ensureChromium();
});
