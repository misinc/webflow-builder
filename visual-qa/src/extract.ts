import type { Page } from "playwright";
import type { CapturedNode } from "./payload.js";

declare global {
  interface Window {
    __pw?: {
      captureStyles: (el: HTMLElement, isRoot: boolean) => Record<string, string>;
    };
  }
}

/**
 * Computed-style capture: render the page in real Chrome and ask the engine
 * what every element in a section actually resolved to, instead of statically
 * re-implementing the CSS cascade.
 *
 * Responsive support: the same section is captured at the desktop base width
 * and at each Webflow breakpoint width (tablet/mobile). The base capture is the
 * base styleLess; each smaller width contributes only the properties that
 * changed from the width above it — the delta model Webflow's `variants` field
 * uses (`medium`/`small`/`tiny`). Deltas are computed in payload.ts.
 *
 * Values are filtered to authored-only:
 * - inherited properties are dropped when they equal the parent's computed
 *   value (the section root compares against UA defaults instead);
 * - non-inherited properties are dropped when they equal the UA default for
 *   that tag (sampled once per tag in a hidden, stylesheet-free iframe);
 * - width/height report USED pixel values even when un-authored, so they are
 *   probed: force `unset` and keep the value only if the layout would change.
 */

export interface SectionCandidate {
  selector: string;
  label: string;
  /** Navbar | Header | Footer | Bar | Section — for a clearer grid label. */
  kind: string;
  width: number;
  height: number;
}

/** Webflow breakpoints, desktop-first. Sample width → variant key. */
export const BREAKPOINTS: Array<{ key: string; width: number }> = [
  { key: "medium", width: 991 },
  { key: "small", width: 767 },
  { key: "tiny", width: 479 }
];
export const BASE_WIDTH = 1440;
const BASE_HEIGHT = 900;

export interface ResponsiveCaptureResult {
  tree: CapturedNode;
  /** The captured subtree's real HTML, annotated with `data-pw-key` on every
   *  kept node — fed to the client-first planner for structure/naming. */
  html: string;
  /** node key (`data-pw-key`) → authored base (desktop) styles. Joins the
   *  planner's restructured nodes back to their browser-computed styles. */
  baseStylesByKey: Record<string, Record<string, string>>;
  /** breakpoint key → (node key → authored styles at that width). */
  breakpointStyles: Record<string, Record<string, Record<string, string>>>;
  warnings: string[];
}

const MAX_CAPTURE_NODES = 1500;

// In-page style-capture helper, injected once so the base pass and every
// breakpoint pass filter styles identically. Defines window.__pw.captureStyles.
const CAPTURE_HELPER = `
(() => {
  if (window.__pw) return;
  const INHERITED = ["color","font-family","font-size","font-weight","font-style","line-height","letter-spacing","text-align","text-transform","white-space"];
  const NON_INHERITED = ["display","position","box-sizing","max-width","max-height","min-width","min-height","margin-top","margin-bottom","padding-top","padding-right","padding-bottom","padding-left","flex-direction","flex-wrap","justify-content","align-items","align-content","align-self","justify-self","flex-grow","flex-shrink","flex-basis","order","row-gap","column-gap","grid-template-columns","grid-template-rows","grid-auto-flow","grid-auto-columns","grid-auto-rows","grid-column-start","grid-column-end","grid-row-start","grid-row-end","overflow-x","overflow-y","aspect-ratio","background-color","background-image","background-position","background-size","background-repeat","background-clip","box-shadow","opacity","object-fit","object-position","text-decoration-line","vertical-align"];
  const SKIPPED_VISIBLE = ["transform","filter","backdrop-filter","clip-path","mix-blend-mode"];
  const SKIPPED_DEFAULTS = {transform:"none",filter:"none","backdrop-filter":"none","clip-path":"none","mix-blend-mode":"normal"};
  const NEUTRAL_VALUES = {"min-width":"auto","min-height":"auto","max-width":"none","max-height":"none","flex-basis":"auto","aspect-ratio":"auto","box-sizing":"border-box","object-position":"50% 50%","background-position":"0% 0%","background-size":"auto","background-repeat":"repeat","background-clip":"border-box","text-decoration-line":"none","vertical-align":"baseline"};
  const SIDES = ["top","right","bottom","left"];

  let frame = null, frameDoc = null;
  const defaultsCache = new Map();
  const ensureFrame = () => {
    if (frameDoc) return;
    frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden","true");
    frame.style.cssText = "position:absolute;left:-10000px;top:0;width:800px;height:600px;border:0;";
    document.documentElement.appendChild(frame);
    frameDoc = frame.contentDocument;
  };
  const defaultsFor = (tag) => {
    const cached = defaultsCache.get(tag);
    if (cached) return cached;
    ensureFrame();
    let probe;
    try { probe = frameDoc.createElement(tag); } catch { probe = frameDoc.createElement("div"); }
    frameDoc.body.appendChild(probe);
    const cs = frameDoc.defaultView.getComputedStyle(probe);
    const snapshot = {};
    for (const prop of INHERITED.concat(NON_INHERITED, SKIPPED_VISIBLE, ["margin-left","margin-right"])) {
      snapshot[prop] = cs.getPropertyValue(prop);
    }
    probe.remove();
    defaultsCache.set(tag, snapshot);
    return snapshot;
  };

  const probeUsedValue = (el, cs, prop) => {
    const current = cs.getPropertyValue(prop);
    const prev = el.style.getPropertyValue(prop);
    const prevPriority = el.style.getPropertyPriority(prop);
    el.style.setProperty(prop,"unset","important");
    const neutral = cs.getPropertyValue(prop);
    if (prev) el.style.setProperty(prop, prev, prevPriority); else el.style.removeProperty(prop);
    return neutral === current ? null : current;
  };
  const marginValue = (el, cs, prop, defaultValue) => {
    const current = cs.getPropertyValue(prop);
    if (current === defaultValue) return null;
    const prev = el.style.getPropertyValue(prop);
    const prevPriority = el.style.getPropertyPriority(prop);
    el.style.setProperty(prop,"auto","important");
    const asAuto = cs.getPropertyValue(prop);
    if (prev) el.style.setProperty(prop, prev, prevPriority); else el.style.removeProperty(prop);
    return (asAuto === current && current !== "0px") ? "auto" : current;
  };

  const captureStyles = (el, isRoot) => {
    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const defaults = defaultsFor(tag);
    const parentCs = (!isRoot && el.parentElement) ? getComputedStyle(el.parentElement) : null;
    const styles = {};
    for (const prop of INHERITED) {
      const value = cs.getPropertyValue(prop);
      const baseline = parentCs ? parentCs.getPropertyValue(prop) : defaults[prop];
      if (value !== baseline) styles[prop] = value;
    }
    for (const prop of NON_INHERITED) {
      const value = cs.getPropertyValue(prop);
      if (value !== defaults[prop] && value !== NEUTRAL_VALUES[prop]) styles[prop] = value;
    }
    for (const side of SIDES) {
      const styleValue = cs.getPropertyValue("border-" + side + "-style");
      const widthValue = cs.getPropertyValue("border-" + side + "-width");
      if (styleValue !== "none" && widthValue !== "0px") {
        styles["border-" + side + "-width"] = widthValue;
        styles["border-" + side + "-style"] = styleValue;
        styles["border-" + side + "-color"] = cs.getPropertyValue("border-" + side + "-color");
      }
    }
    for (const corner of ["top-left","top-right","bottom-left","bottom-right"]) {
      const radius = cs.getPropertyValue("border-" + corner + "-radius");
      if (radius !== "0px") styles["border-" + corner + "-radius"] = radius;
    }
    if (cs.position !== "static") {
      const skipZero = cs.position === "relative";
      for (const side of SIDES) {
        const value = cs.getPropertyValue(side);
        if (value !== "auto" && !(skipZero && value === "0px")) styles[side] = value;
      }
      const zIndex = cs.getPropertyValue("z-index");
      if (zIndex !== "auto") styles["z-index"] = zIndex;
    }
    // Replaced/form elements have an intrinsic default width, so the width
    // probe misreads a stretched full-width control as authored. Skip width
    // for them (stays fluid); keep height (form controls have a real height).
    const INTRINSIC_WIDTH_TAGS = new Set(["input","textarea","select","button","img","video","audio","iframe","canvas","embed","object","svg"]);
    const dims = INTRINSIC_WIDTH_TAGS.has(tag) ? ["height"] : ["width","height"];
    for (const prop of dims) {
      const authored = probeUsedValue(el, cs, prop);
      if (authored !== null) styles[prop] = authored;
    }
    for (const prop of ["margin-left","margin-right"]) {
      const value = marginValue(el, cs, prop, defaults[prop]);
      if (value !== null) styles[prop] = value;
    }
    return styles;
  };

  window.__pw = { captureStyles };
})();
`;

export async function preparePage(page: Page, url: string, timeoutMs: number): Promise<void> {
  // tsx runs this file through esbuild with keepNames, which injects __name()
  // helper calls into the functions page.evaluate serializes into the browser;
  // define the helper in the page so those functions can run.
  await page.addInitScript("globalThis.__name = (fn) => fn;");
  await page.addInitScript(CAPTURE_HELPER);
  // networkidle never fires on pages with analytics beacons/long-polling —
  // wait for load, then take network idle as best-effort.
  await page.goto(url, { waitUntil: "load", timeout: timeoutMs });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }"
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  // Scroll through the page once so lazy-loaded content and images settle.
  await page.evaluate(async () => {
    const step = Math.max(window.innerHeight, 400);
    for (let pass = 0, y = 0; y < document.body.scrollHeight && pass < 60; pass += 1, y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

export async function findSectionCandidates(page: Page): Promise<SectionCandidate[]> {
  return page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // min-height 24 so thin announcement/message bars aren't dropped.
      return rect.width >= 300 && rect.height >= 24 && cs.display !== "none" && cs.visibility !== "hidden";
    };

    // Classify a structural block for a clearer grid label.
    const kindFor = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const cls = el.className && typeof el.className === "string" ? el.className.toLowerCase() : "";
      const role = el.getAttribute("role") ?? "";
      if (tag === "nav" || role === "navigation" || /(^|[-_ ])nav(bar)?([-_ ]|$)/.test(cls)) return "Navbar";
      if (tag === "header" || role === "banner") return "Header";
      if (tag === "footer" || role === "contentinfo" || /footer/.test(cls)) return "Footer";
      const rect = el.getBoundingClientRect();
      if (rect.height <= 80 && /(announce|banner|topbar|message|notice|alert|promo)/.test(cls)) return "Bar";
      return "Section";
    };

    const cssPath = (el: Element): string => {
      if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
        return `#${CSS.escape(el.id)}`;
      }
      const segments: string[] = [];
      let current: Element | null = el;
      while (current && current !== document.body) {
        const tag = current.tagName.toLowerCase();
        const parent: Element | null = current.parentElement;
        if (!parent) {
          break;
        }
        const sameTag = [...parent.children].filter((child) => child.tagName === current!.tagName);
        segments.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag);
        current = parent;
      }
      return `body > ${segments.join(" > ")}`;
    };

    const labelFor = (el: Element): string => {
      const heading = el.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim();
      if (heading) {
        return heading.slice(0, 60);
      }
      if (el.id) {
        return `#${el.id}`;
      }
      const firstClass = el.classList[0];
      return firstClass ? `${el.tagName.toLowerCase()}.${firstClass}` : el.tagName.toLowerCase();
    };

    // Always start from the page's top-level structural children; then add any
    // landmarks found anywhere (nav/header/footer/section, incl. role-based).
    // The containment filter + wrapper-expand below recover the real blocks.
    const root = document.querySelector("main") ?? document.body;
    let elements: Element[] = root ? [...root.children] : [];
    elements.push(
      ...document.querySelectorAll(
        "header, footer, section, nav, [role='navigation'], [role='banner'], [role='contentinfo']"
      )
    );
    elements = [...new Set(elements)].filter(isVisible);
    let topLevel = elements.filter(
      (el) => !elements.some((other) => other !== el && other.contains(el))
    );
    // Page-wrapper divs (very tall, e.g. a Webflow .page-wrapper) aren't
    // sections — descend into them until candidates are section-sized.
    const expand = (el: Element, depth: number): Element[] => {
      const rect = el.getBoundingClientRect();
      if (depth >= 4 || rect.height <= 2200) {
        return [el];
      }
      const children = [...el.children].filter(isVisible);
      if (children.length === 0) {
        return [el];
      }
      if (children.length === 1) {
        return expand(children[0], depth + 1);
      }
      return children.flatMap((child) => expand(child, depth + 1));
    };
    topLevel = [...new Set(topLevel.flatMap((el) => expand(el, 0)))];
    topLevel.sort((a, b) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    return topLevel.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        selector: cssPath(el),
        label: labelFor(el),
        kind: kindFor(el),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
  });
}

/**
 * Capture a section responsively: build the element tree + base styles at the
 * desktop width, then re-capture authored styles at each breakpoint width so
 * payload.ts can compute per-breakpoint deltas.
 */
export async function captureElement(page: Page, selector: string): Promise<ResponsiveCaptureResult> {
  await page.setViewportSize({ width: BASE_WIDTH, height: BASE_HEIGHT });
  await page.waitForTimeout(150);

  const base = (await page.evaluate(
    ({ selector, maxNodes }) => {
      const root = document.querySelector(selector);
      if (!root) {
        throw new Error(`Selector not found: ${selector}`);
      }
      const capture = window.__pw!.captureStyles;
      const warnings = new Set<string>();
      let nodeCount = 0;

      const DROP_TAGS = new Set(["script", "style", "noscript", "template", "link", "meta", "br", "source", "track", "wbr"]);
      const MEDIA_PLACEHOLDER_TAGS = new Set(["video", "audio", "iframe", "canvas", "embed", "object"]);
      const FORM_PLACEHOLDER_TAGS = new Set(["input", "select", "textarea"]);
      const SKIPPED_VISIBLE = ["transform", "filter", "backdrop-filter", "clip-path", "mix-blend-mode"];
      const SKIPPED_DEFAULTS: Record<string, string> = {
        transform: "none",
        filter: "none",
        "backdrop-filter": "none",
        "clip-path": "none",
        "mix-blend-mode": "normal"
      };

      // Intrinsic media (img/svg) keep both dimensions so layout holds.
      const forcedSizeStyles = (el: Element, cs: CSSStyleDeclaration): Record<string, string> => ({
        width: cs.getPropertyValue("width"),
        height: cs.getPropertyValue("height")
      });
      // Form/media placeholders keep only their control height — width stays
      // fluid (inputs are full-width), so no spurious per-breakpoint width deltas.
      const forcedHeight = (el: Element, cs: CSSStyleDeclaration): Record<string, string> => ({
        height: cs.getPropertyValue("height")
      });

      const directText = (el: Element): string | undefined => {
        const parts: string[] = [];
        for (const child of el.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent) {
            parts.push(child.textContent);
          }
        }
        const text = parts.join(" ").replace(/\s+/g, " ").trim();
        return text || undefined;
      };

      // All descendant text in DOCUMENT order (so styled <span>s and <br>s inside
      // a heading don't get reordered when the element is flattened to text-only).
      // <br> becomes a space so line-broken words stay separated.
      const orderedText = (el: Element): string | undefined => {
        let out = "";
        const walkText = (node: Node): void => {
          for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              out += child.textContent ?? "";
            } else if (child.nodeName === "BR") {
              out += " ";
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              walkText(child);
            }
          }
        };
        walkText(el);
        const text = out.replace(/\s+/g, " ").trim();
        return text || undefined;
      };

      const noteSkipped = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        for (const prop of SKIPPED_VISIBLE) {
          if (cs.getPropertyValue(prop) !== SKIPPED_DEFAULTS[prop]) {
            warnings.add(`\`${prop}\` is used by the original but not carried (paste-safety) — apply manually if it matters visually.`);
          }
        }
        if (cs.visibility === "hidden") {
          warnings.add("An element with visibility:hidden was captured as visible.");
        }
      };

      const walk = (el: HTMLElement, isRoot: boolean, path: string): (CapturedNode & { key: string }) | null => {
        const tag = el.tagName.toLowerCase();
        if (DROP_TAGS.has(tag)) {
          return null;
        }
        const cs = getComputedStyle(el);
        if (cs.display === "none") {
          return null;
        }
        nodeCount += 1;
        if (nodeCount > maxNodes) {
          throw new Error(`Section is too large to capture (> ${maxNodes} elements) — pick a smaller section.`);
        }
        // Tag the element so breakpoint passes can re-read the same node.
        el.setAttribute("data-pw-key", path);
        noteSkipped(el);

        if (tag === "svg") {
          const markup = el.outerHTML;
          const styles = capture(el, isRoot);
          styles.width = cs.getPropertyValue("width");
          styles.height = cs.getPropertyValue("height");
          if (markup.length > 30_000) {
            warnings.add("An inline SVG over 30KB was replaced with a sized placeholder.");
            return { tag: "div", key: path, attrs: {}, styles, children: [] };
          }
          return { tag: "div", key: path, embedHtml: markup, attrs: {}, styles, children: [] };
        }

        if (MEDIA_PLACEHOLDER_TAGS.has(tag) || FORM_PLACEHOLDER_TAGS.has(tag)) {
          warnings.add(`<${tag}> elements paste as sized placeholder divs.`);
          return { tag: "div", key: path, attrs: {}, styles: { ...capture(el, isRoot), ...forcedHeight(el, cs) }, children: [] };
        }
        if (tag === "button") {
          warnings.add("<button> elements paste as divs — rebuild real CTAs as links.");
        }

        const styles = capture(el, isRoot);
        // Direct colors: carry the EFFECTIVE (possibly inherited) text color on
        // text elements. Dark sections set color once on the wrapper and let
        // headings inherit it; the inheritance filter drops that, but a heading
        // that reuses a Style-Guide class needs its own color to override the
        // class's scheme-bound Text — so keep the computed color here.
        if (/^(h[1-6]|p|blockquote)$/.test(tag)) {
          styles.color = cs.getPropertyValue("color");
        }
        const node: CapturedNode & { key: string } = { tag, key: path, attrs: {}, styles, children: [] };
        if (el.id) {
          node.attrs.id = el.id;
        }
        if (tag === "img") {
          const img = el as HTMLImageElement;
          node.attrs.src = img.currentSrc || img.src || undefined;
          node.attrs.alt = img.alt || undefined;
          styles.width = cs.getPropertyValue("width");
          styles.height = cs.getPropertyValue("height");
          return node;
        }
        if (tag === "a") {
          node.attrs.href = (el as HTMLAnchorElement).href || undefined;
        }

        // Text-only elements (headings/paragraphs) flatten to a single string.
        // Capture it in document order so interleaved styled spans and <br>s keep
        // their reading order (Webflow text elements can't hold children anyway).
        if (/^(h[1-6]|p|blockquote)$/.test(tag)) {
          node.text = orderedText(el);
          return node;
        }

        node.text = directText(el);
        let childIndex = 0;
        for (const child of el.children) {
          const captured = walk(child as HTMLElement, false, `${path}.${childIndex}`);
          if (captured) {
            node.children.push(captured);
            childIndex += 1;
          }
        }
        return node;
      };

      const tree = walk(root as HTMLElement, true, "0");
      if (!tree) {
        throw new Error("The selected element is hidden or not capturable.");
      }
      // Drop everything the walk didn't keep (hidden / dropped tags carry no
      // data-pw-key) so the returned HTML matches the captured tree 1:1, then
      // hand the planner real, annotated markup with original classes intact.
      for (const el of Array.from(root.querySelectorAll("*"))) {
        if (!el.hasAttribute("data-pw-key")) {
          el.remove();
        }
      }
      const html = (root as HTMLElement).outerHTML;
      return { tree, warnings: [...warnings], html };
    },
    { selector, maxNodes: MAX_CAPTURE_NODES }
  )) as { tree: CapturedNode; warnings: string[]; html: string };

  const breakpointStyles: Record<string, Record<string, Record<string, string>>> = {};
  const rootKey = "0";
  for (const breakpoint of BREAKPOINTS) {
    await page.setViewportSize({ width: breakpoint.width, height: BASE_HEIGHT });
    await page.waitForTimeout(150);
    breakpointStyles[breakpoint.key] = await page.evaluate((rootKey) => {
      const out: Record<string, Record<string, string>> = {};
      for (const el of document.querySelectorAll("[data-pw-key]")) {
        const key = el.getAttribute("data-pw-key")!;
        out[key] = window.__pw!.captureStyles(el as HTMLElement, key === rootKey);
      }
      return out;
    }, rootKey);
  }

  // Flatten the captured tree into a key→styles map for the base width. Built
  // from the tree (not a fresh DOM query) so it keeps the effective text-color
  // injected on headings/paragraphs during capture.
  const baseStylesByKey: Record<string, Record<string, string>> = {};
  const collectBase = (node: CapturedNode): void => {
    if (node.key) {
      baseStylesByKey[node.key] = node.styles;
    }
    for (const child of node.children) {
      collectBase(child);
    }
  };
  collectBase(base.tree);

  return {
    tree: base.tree,
    html: base.html,
    baseStylesByKey,
    breakpointStyles,
    warnings: base.warnings
  };
}
