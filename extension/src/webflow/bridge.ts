import {
  dedupe,
  inferSharedCategory,
  isReservedStyleGuideClassName
} from "@wfb/shared/client-first.js";
import {
  BuildNode,
  SharedStyleContext,
  WebflowSitePage
} from "@wfb/shared/contracts.js";

export interface DesignerContext {
  siteId: string | null;
  siteName: string | null;
  siteDomain?: string | null;
  pageId: string | null;
  pageName: string | null;
  mode: "design" | "build" | "edit" | "preview" | "comment" | "unknown";
  selectedElementId: string | null;
}

export interface CreateNodeInput {
  parentId: string | null;
  afterId?: string | null;
  node: BuildNode;
}

export interface CreatePageInput {
  name: string;
  slug?: string | null;
  switchToNewPage?: boolean;
}

export interface RegisteredComponent {
  id: string;
  name: string;
}

export interface CreateComponentInstanceInput {
  componentId: string;
  parentId: string | null;
  afterId?: string | null;
}

export interface WebflowDesignerBridge {
  getContext(): Promise<DesignerContext>;
  getSitePages(siteId: string): Promise<WebflowSitePage[]>;
  subscribeToCurrentPage(listener: () => void): () => void;
  switchToPage(pageId: string): Promise<void>;
  createPage(input: CreatePageInput): Promise<WebflowSitePage>;
  inspectSharedStyles(siteId: string): Promise<SharedStyleContext>;
  /** All project styles as name → real style id (for clipboard-paste class reuse). */
  listStyleIds(): Promise<Array<{ name: string; id: string }>>;
  /**
   * Walk the currently selected element's subtree and swap any duplicated
   * "name N" class (created by pasting when "name" already exists) back to the
   * project's base class. Returns what was changed.
   */
  dedupeSelectionStyles(): Promise<{
    scanned: number;
    updatedElements: number;
    swappedClasses: string[];
  }>;
  /**
   * Walk the selected element's subtree and rebind color properties whose
   * literal value matches a project variable to that variable. (The clipboard
   * cannot carry variable references — Webflow flattens them to literals even
   * in its own copies — so tokens are re-linked after the paste.)
   */
  bindTokensInSelection(): Promise<{
    stylesScanned: number;
    boundProperties: number;
    bindings: string[];
  }>;
  createNode(input: CreateNodeInput): Promise<{ id: string }>;
  createComponentInstance(input: CreateComponentInstanceInput): Promise<{ id: string }>;
  openComponentCanvas(componentId: string): Promise<void>;
  exitComponentCanvas(): Promise<void>;
  getComponentRootElement(componentId: string): Promise<{ id: string } | null>;
  setNodeTextContent(nodeId: string, content: string): Promise<void>;
  configureNode(
    nodeId: string,
    node: Pick<BuildNode, "tag" | "classNames" | "textContent">
  ): Promise<void>;
  registerBlankComponent(input: {
    name: string;
    group?: string;
    description?: string;
  }): Promise<RegisteredComponent>;
  registerComponentFromNode(
    nodeId: string,
    input: {
      name: string;
      group?: string;
      description?: string;
      replace?: boolean;
    }
  ): Promise<RegisteredComponent>;
  applyClasses(nodeId: string, classNames: string[]): Promise<void>;
  ensureStyle(
    className: string,
    properties: Record<string, string>
  ): Promise<{ styleId: string }>;
  bindVariable(
    nodeId: string,
    property: string,
    variableName: string,
    value?: string
  ): Promise<void>;
  bindAsset(
    nodeId: string,
    source: string,
    fallback: "placeholder" | "warning-only"
  ): Promise<{ resolved: boolean }>;
  setNodeAttribute?(nodeId: string, name: string, value: string): Promise<void>;
  deleteNodes(nodeIds: string[]): Promise<void>;
  deleteStyles(styleIds: string[]): Promise<void>;
}

type ElementIdValue = string | { component?: string; element?: string };

type WebflowStyleValue = string | WebflowVariable;

interface WebflowStyle {
  id: string;
  getName(): Promise<string>;
  getProperties?(): Promise<Record<string, unknown>>;
  setProperties(props: Record<string, unknown>): Promise<void>;
  setProperty?(property: string, value: WebflowStyleValue): Promise<void>;
}

interface WebflowVariable {
  id: string;
  type?: string;
  getName(): Promise<string>;
  getBinding?(): Promise<string>;
  get?(): Promise<unknown>;
}

interface WebflowVariableCollection {
  getAllVariables(): Promise<WebflowVariable[]>;
  getVariableByName(name: string): Promise<WebflowVariable | null>;
}

interface WebflowAsset {
  id: string;
  getName(): Promise<string>;
  getUrl(): Promise<string>;
  setAltText?(text: string): Promise<null>;
}

interface WebflowElement {
  id: ElementIdValue;
  type: string;
  children?: boolean;
  styles?: boolean;
  textContent?: boolean;
  append(
    presetOrTag: unknown
  ): Promise<WebflowElement>;
  after(
    presetOrTag: unknown
  ): Promise<WebflowElement>;
  setAsset?(asset: WebflowAsset | null): Promise<null>;
  setAltText?(text: string): Promise<null>;
  setTag?(tag: string): Promise<void>;
  setAttribute?(name: string, value: string): Promise<void>;
  setCustomAttribute?(name: string, value: string): Promise<void>;
  setTextContent?(content: string): Promise<void>;
  setStyles?(styles: WebflowStyle[]): Promise<null>;
  getStyles?(): Promise<WebflowStyle[]>;
  getChildren?(): Promise<WebflowElement[]>;
  remove?(): Promise<null>;
}

interface WebflowPage {
  id: string;
  name?: string;
  slug?: string | null;
  append?(presetOrTag: unknown): Promise<WebflowElement | null>;
  children?: boolean;
  getName?(): Promise<string>;
  getSlug?(): Promise<string | null>;
  setName?(name: string): Promise<null>;
  setSlug?(slug: string): Promise<null>;
  isHomepage?: boolean;
  getIsHomepage?(): Promise<boolean>;
}

interface WebflowComponent {
  id: string;
  getName(): Promise<string>;
  getRootElement?(): Promise<WebflowElement | null>;
}

interface WebflowApi {
  elementPresets: {
    DOM: unknown;
    DivBlock?: unknown;
    LinkBlock?: unknown;
    Blockquote?: unknown;
    TextBlock?: unknown;
    Image?: unknown;
  };
  getSiteInfo(): Promise<Record<string, unknown> & { siteId: string }>;
  getCurrentPage(): Promise<WebflowPage | null>;
  createPage?(): Promise<WebflowPage>;
  getAllPagesAndFolders?(): Promise<unknown[]>;
  switchPage?(page: WebflowPage): Promise<void>;
  openCanvas?(target: WebflowComponent | WebflowElement | WebflowPage | { componentId: string } | { pageId: string }): Promise<void>;
  exitComponent?(): Promise<null>;
  getAllComponents?(): Promise<WebflowComponent[]>;
  registerComponent?(
    options:
      | string
      | {
          name: string;
          group?: string;
          description?: string;
          replace?: boolean;
        },
    rootOrSource?: WebflowElement
  ): Promise<WebflowComponent>;
  subscribe?(
    eventName: string,
    listener: (...args: unknown[]) => void
  ):
    | void
    | (() => void)
    | { unsubscribe?: () => void }
    | Promise<void | (() => void) | { unsubscribe?: () => void }>;
  getCurrentMode(): Promise<string | null>;
  getSelectedElement(): Promise<WebflowElement | null>;
  getAllStyles(): Promise<WebflowStyle[]>;
  getStyleByName(name: string | string[]): Promise<WebflowStyle | null>;
  createStyle(name: string, options?: { parent?: WebflowStyle }): Promise<WebflowStyle>;
  removeStyle(style: WebflowStyle): Promise<void>;
  getDefaultVariableCollection(): Promise<WebflowVariableCollection | null>;
  getAllAssets(): Promise<WebflowAsset[]>;
  createAsset?(fileBlob: File): Promise<WebflowAsset>;
}

interface WebflowSiteDomain {
  url?: string;
  default?: boolean;
  stage?: "staging" | "production";
}

declare global {
  interface Window {
    __WEBFLOW_SECTION_BUILDER_BRIDGE__?: WebflowDesignerBridge;
    webflow?: WebflowApi;
    Webflow?: WebflowApi;
  }
}

/**
 * Normalize a color literal for value-equality matching against variable
 * values: lowercase hex, #abc expanded to #aabbcc, rgb()/opaque rgba() → hex.
 * Non-color-looking strings pass through lowercased so named colors still match.
 */
export function normalizeColorValue(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const shortHex = /^#([0-9a-f]{3})$/.exec(trimmed);
  if (shortHex) {
    return `#${shortHex[1].split("").map((c) => c + c).join("")}`;
  }
  if (/^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(1|1\.0+)\s*)?\)$/.exec(trimmed);
  if (rgb) {
    const toHex = (part: string) => Number(part).toString(16).padStart(2, "0");
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
  }
  return trimmed;
}

export type TokenKind = "color" | "size" | "fontFamily" | "other";

/** Values too generic to safely token-match ("0px" would bind every border). */
const TRIVIAL_TOKEN_VALUES = new Set([
  "0", "0px", "0rem", "0em", "0%", "1", "auto", "none", "normal",
  "inherit", "initial", "unset", "transparent", "100%", "50%"
]);

/**
 * Normalize a variable's raw value (or a style literal) for value matching,
 * classifying it so tokens only bind to compatible properties. Size variables
 * from the Designer API may arrive as { unit, value } objects.
 */
export function normalizeTokenLiteral(
  raw: unknown
): { normalized: string; kind: TokenKind } | null {
  if (raw && typeof raw === "object" && "unit" in raw && "value" in raw) {
    const sized = raw as { unit: unknown; value: unknown };
    return { normalized: `${String(sized.value)}${String(sized.unit)}`.toLowerCase(), kind: "size" };
  }
  if (typeof raw !== "string" && typeof raw !== "number") {
    return null;
  }
  const text = String(raw).trim();
  if (!text) {
    return null;
  }
  if (/^#|^rgba?\(/i.test(text)) {
    const color = normalizeColorValue(text);
    return color ? { normalized: color, kind: "color" } : null;
  }
  if (/^-?[\d.]+(px|rem|em|vw|vh|%|ch|svh|dvh)$/i.test(text)) {
    return { normalized: text.toLowerCase(), kind: "size" };
  }
  if (/^-?[\d.]+$/.test(text)) {
    return { normalized: text, kind: "other" };
  }
  return { normalized: text.toLowerCase(), kind: "fontFamily" };
}

/** Which properties a token of the given kind may bind to. */
export function tokenKindMatchesProperty(kind: TokenKind, property: string): boolean {
  if (kind === "color") {
    return (
      property === "color" || property.endsWith("-color") ||
      property === "fill" || property === "stroke"
    );
  }
  if (kind === "size") {
    return (
      /^(font-size|letter-spacing|line-height|gap|row-gap|column-gap|width|height|top|right|bottom|left)$/.test(property) ||
      property.startsWith("padding") || property.startsWith("margin") ||
      property.startsWith("min-") || property.startsWith("max-") ||
      property.endsWith("-radius") || property === "border-radius" ||
      property.endsWith("-width")
    );
  }
  if (kind === "fontFamily") {
    return property === "font-family";
  }
  return /^(line-height|font-weight|opacity)$/.test(property);
}

function normalizeElementId(id: ElementIdValue | null | undefined): string | null {
  if (!id) {
    return null;
  }
  if (typeof id === "string") {
    return id;
  }
  if (id.component && id.element) {
    return `${id.component}:${id.element}`;
  }
  return JSON.stringify(id);
}

function categorizeVariable(name: string, variableType?: string): string {
  const inferred = inferSharedCategory(name);
  if (inferred) {
    return inferred;
  }

  switch (variableType?.toLowerCase()) {
    case "color":
      return "color";
    case "size":
      return "spacing";
    case "font":
      return "font";
    case "number":
      return "number";
    case "percentage":
      return "percentage";
    default:
      return "custom";
  }
}

function slugToRoute(slug: string | null | undefined, isHomepage = false): string | null {
  if (isHomepage || slug === "home" || slug === "index" || slug === "") {
    return "/";
  }
  if (!slug) {
    return null;
  }
  return slug.startsWith("/") ? slug : `/${slug}`;
}

function normalizeSiteDomain(siteInfo: Record<string, unknown>): string | null {
  const domains = Array.isArray(siteInfo.domains)
    ? (siteInfo.domains as WebflowSiteDomain[])
    : [];
  const preferred =
    domains.find((domain) => domain.default && domain.stage === "production") ??
    domains.find((domain) => domain.stage === "production") ??
    domains.find((domain) => domain.default) ??
    domains[0];

  if (preferred?.url && typeof preferred.url === "string") {
    return preferred.url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  const shortName =
    typeof siteInfo.shortName === "string" ? siteInfo.shortName.trim() : "";
  return shortName ? `${shortName}.webflow.io` : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function canAppendChildren(element: WebflowElement | null): element is WebflowElement {
  return Boolean(element?.append) && element?.children !== false;
}

class RealWebflowDesignerBridge implements WebflowDesignerBridge {
  private readonly stylesById = new Map<string, WebflowStyle>();
  private readonly stylesByName = new Map<string, WebflowStyle>();
  private readonly elementsById = new Map<string, WebflowElement>();
  private readonly assetsByKey = new Map<string, WebflowAsset>();

  constructor(private readonly api: WebflowApi) {}

  private looksLikeStatText(content: string | null | undefined): boolean {
    const normalized = content?.trim() ?? "";
    if (!normalized || normalized.length > 40) {
      return false;
    }
    return /^\d[\d+.,:%xX°/-]*$/.test(normalized);
  }

  private isTextBlockNode(node: BuildNode): boolean {
    return (
      node.tag === "div" &&
      typeof node.textContent === "string" &&
      node.textContent.trim().length > 0 &&
      node.children.length === 0 &&
      (
        node.classNames.some((className) =>
          /(tagline|eyebrow|mini-label|item_value|stat|metric)/i.test(className)
        ) || this.looksLikeStatText(node.textContent) || node.classNames.length === 0
      )
    );
  }

  private getInsertionSpec(node: BuildNode): unknown {
    // Inline SVG icons can't be injected via the Designer API. Represent them as
    // a real Image element — a visible, asset-ready placeholder inside the link —
    // instead of an empty icon-embed div.
    if (node.type === "embed" && node.classNames.some((name) => name.startsWith("icon-embed"))) {
      return this.api.elementPresets.Image ?? this.api.elementPresets.DOM;
    }
    if (node.tag === "img") {
      return this.api.elementPresets.Image ?? this.api.elementPresets.DOM;
    }
    if (node.tag === "blockquote") {
      return this.api.elementPresets.Blockquote ?? "blockquote";
    }
    if (node.tag === "ul" || node.tag === "ol" || node.tag === "li") {
      return this.api.elementPresets.DOM;
    }
    if (this.isTextBlockNode(node)) {
      return this.api.elementPresets.TextBlock ?? this.api.elementPresets.DOM;
    }
    if (node.tag === "div") {
      return this.api.elementPresets.DivBlock ?? "div";
    }
    if (node.tag === "button") {
      // A Webflow Button element is text-only and can't hold children — a CTA
      // with an icon + label collapses to the default "Button Text" with its
      // children hoisted out. A Link Block holds children (icon + label).
      return this.api.elementPresets.LinkBlock ?? this.api.elementPresets.DivBlock ?? "a";
    }
    return node.tag || this.api.elementPresets.DOM;
  }

  private getAssetLabel(source: string): string {
    return source
      .split("/")
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Imported asset";
  }

  private async setSafeImageAlt(
    element: WebflowElement,
    altText: string | null | undefined
  ): Promise<void> {
    const normalized = altText?.trim();
    if (!normalized) {
      return;
    }

    if (element.setAltText) {
      await element.setAltText(normalized);
    }
  }

  private registerElement(element: WebflowElement | null): string | null {
    const id = normalizeElementId(element?.id);
    if (!element || !id) {
      return null;
    }
    this.elementsById.set(id, element);
    return id;
  }

  private async getSelectedElement(): Promise<WebflowElement | null> {
    const selected = await this.api.getSelectedElement();
    this.registerElement(selected);
    return selected;
  }

  private async getLiveElementHandle(nodeId: string): Promise<WebflowElement | null> {
    const selected = await this.getSelectedElement().catch(() => null);
    if (normalizeElementId(selected?.id) === nodeId) {
      return selected;
    }
    return this.elementsById.get(nodeId) ?? null;
  }

  private async setElementTextContent(
    nodeId: string,
    fallbackElement: WebflowElement | null,
    content: string
  ): Promise<void> {
    const normalized = content.trim();
    if (!normalized) {
      return;
    }
    const liveElement = await this.getLiveElementHandle(nodeId).catch(() => null);
    const target = liveElement ?? fallbackElement;
    await target?.setTextContent?.(normalized);
  }

  private async resolveAnchor(input: CreateNodeInput): Promise<{
    parent: WebflowElement | null;
    after: WebflowElement | null;
  }> {
    const explicitParent = input.parentId
      ? this.elementsById.get(input.parentId) ?? null
      : null;
    const explicitAfter = input.afterId
      ? this.elementsById.get(input.afterId) ?? null
      : null;
    const currentPage = await this.api.getCurrentPage().catch(() => null);

    if (canAppendChildren(explicitParent)) {
      return { parent: explicitParent, after: null };
    }

    if (explicitAfter) {
      return { parent: null, after: explicitAfter };
    }

    if (
      input.parentId &&
      currentPage?.id === input.parentId &&
      canAppendChildren(currentPage as unknown as WebflowElement | null)
    ) {
      return {
        parent: currentPage as unknown as WebflowElement,
        after: null
      };
    }

    const selected = await this.getSelectedElement();
    if (canAppendChildren(selected)) {
      return { parent: selected, after: null };
    }
    if (selected) {
      return { parent: null, after: selected };
    }

    return { parent: explicitParent, after: null };
  }

  private async getOrCreateStyle(className: string): Promise<WebflowStyle> {
    const cached = this.stylesByName.get(className);
    if (cached) {
      return cached;
    }

    const existing = await this.api.getStyleByName(className);
    const style = existing ?? (await this.api.createStyle(className));
    this.stylesByName.set(className, style);
    this.stylesById.set(style.id, style);
    return style;
  }

  private async getLastAppliedStyle(element: WebflowElement): Promise<WebflowStyle | null> {
    if (!element.styles || !element.getStyles) {
      return null;
    }
    const styles = await element.getStyles();
    return styles.at(-1) ?? null;
  }

  private async findAsset(source: string): Promise<WebflowAsset | null> {
    const cached = this.assetsByKey.get(source);
    if (cached) {
      return cached;
    }

    const sourceName = source.split("/").pop()?.toLowerCase() ?? source.toLowerCase();
    const assets = await this.api.getAllAssets();
    for (const asset of assets) {
      const [name, url] = await Promise.all([asset.getName(), asset.getUrl()]);
      const normalizedName = name.toLowerCase();
      if (
        normalizedName === sourceName ||
        url === source ||
        url.toLowerCase().endsWith(sourceName)
      ) {
        this.assetsByKey.set(source, asset);
        return asset;
      }
    }
    return null;
  }

  private async findPageById(pageId: string): Promise<WebflowPage | null> {
    const liveItems = this.api.getAllPagesAndFolders
      ? await this.api.getAllPagesAndFolders().catch(() => [])
      : [];
    const queue = [...liveItems];

    while (queue.length > 0) {
      const item = queue.shift();
      if (!isRecord(item)) {
        continue;
      }
      if (typeof item.id === "string" && item.id === pageId) {
        return item as unknown as WebflowPage;
      }
      if (Array.isArray(item.pages)) {
        queue.push(...item.pages);
      }
    }

    return null;
  }

  private async findComponentById(componentId: string): Promise<WebflowComponent | null> {
    const components = this.api.getAllComponents
      ? await this.api.getAllComponents().catch(() => [])
      : [];
    return components.find((component) => component.id === componentId) ?? null;
  }

  private async createPlaceholderAsset(): Promise<WebflowAsset | null> {
    if (!this.api.createAsset) {
      return null;
    }

    const placeholderUrl = "https://placehold.co/1200x800/png?text=Asset+Missing";
    const response = await fetch(placeholderUrl);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const file = new File([blob], "webflow-builder-missing-asset.png", {
      type: blob.type || "image/png"
    });
    const asset = await this.api.createAsset(file);
    await asset.setAltText?.("Missing asset placeholder");
    this.assetsByKey.set(placeholderUrl, asset);
    return asset;
  }

  async getContext(): Promise<DesignerContext> {
    const [siteInfo, page, mode, selected] = await Promise.all([
      this.api.getSiteInfo(),
      this.api.getCurrentPage(),
      this.api.getCurrentMode(),
      this.api.getSelectedElement()
    ]);

    const context: DesignerContext = {
      siteId: siteInfo.siteId ?? null,
      siteName:
        (typeof siteInfo.siteName === "string" ? siteInfo.siteName : null) ??
        (typeof siteInfo.name === "string" ? siteInfo.name : null) ??
        (typeof siteInfo.shortName === "string" ? siteInfo.shortName : null) ??
        (typeof siteInfo.displayName === "string" ? siteInfo.displayName : null) ??
        null,
      siteDomain: normalizeSiteDomain(siteInfo),
      pageId: page?.id ?? null,
      pageName:
        (await page?.getName?.().catch(() => null)) ??
        page?.name ??
        null,
      mode:
        mode === "design" ||
        mode === "build" ||
        mode === "edit" ||
        mode === "preview" ||
        mode === "comment"
          ? mode
          : "unknown",
      selectedElementId: this.registerElement(selected)
    };
    return context;
  }

  async getSitePages(_siteId: string): Promise<WebflowSitePage[]> {
    const currentPage = await this.api.getCurrentPage();
    const currentPageName =
      (await currentPage?.getName?.()) ??
      currentPage?.name ??
      (currentPage?.id ? "Current page" : null);
    const currentPageSlug =
      (await currentPage?.getSlug?.()) ?? currentPage?.slug ?? null;
    const currentPageIsHomepage =
      (await currentPage?.getIsHomepage?.()) ?? currentPage?.isHomepage ?? false;

    const liveItems = this.api.getAllPagesAndFolders
      ? await this.api.getAllPagesAndFolders().catch(() => [])
      : [];

    const pages: WebflowSitePage[] = [];

    const visit = async (value: unknown) => {
      if (!isRecord(value)) {
        return;
      }

      const nestedPages = value.pages;
      if (Array.isArray(nestedPages)) {
        for (const item of nestedPages) {
          await visit(item);
        }
      }

      const id = typeof value.id === "string" ? value.id : null;
      if (!id) {
        return;
      }

      const maybePage = value as unknown as WebflowPage;
      const name =
        (await maybePage.getName?.().catch(() => null)) ??
        (typeof value.name === "string" ? value.name : null) ??
        id;
      const slug =
        (await maybePage.getSlug?.().catch(() => null)) ??
        (typeof value.slug === "string" ? value.slug : null);
      const isHomepage =
        (await maybePage.getIsHomepage?.().catch(() => false)) ??
        (typeof value.isHomepage === "boolean" ? value.isHomepage : false);

      pages.push({
        id,
        name,
        route: slugToRoute(slug, isHomepage),
        isHomepage
      });
    };

    for (const item of liveItems) {
      await visit(item);
    }

    if (pages.length === 0 && currentPage?.id) {
      pages.push({
        id: currentPage.id,
        name: currentPageName ?? currentPage.id,
        route: slugToRoute(currentPageSlug, currentPageIsHomepage),
        isHomepage: currentPageIsHomepage
      });
    }

    return dedupe(pages.map((page) => page.id)).map(
      (id) => pages.find((page) => page.id === id)!
    );
  }

  subscribeToCurrentPage(listener: () => void): () => void {
    if (!this.api.subscribe) {
      return () => {};
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void Promise.resolve(
      this.api.subscribe("currentpage", () => {
        if (!disposed) {
          listener();
        }
      })
    )
      .then((subscription) => {
        if (typeof subscription === "function") {
          cleanup = subscription;
        } else if (
          subscription &&
          typeof subscription === "object" &&
          "unsubscribe" in subscription &&
          typeof subscription.unsubscribe === "function"
        ) {
          cleanup = () => subscription.unsubscribe?.();
        }

        if (disposed) {
          cleanup?.();
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      cleanup?.();
    };
  }

  async switchToPage(pageId: string): Promise<void> {
    if (!this.api.switchPage) {
      return;
    }
    const currentPage = await this.api.getCurrentPage().catch(() => null);
    if (currentPage?.id === pageId) {
      return;
    }
    const targetPage = await this.findPageById(pageId);
    if (!targetPage) {
      throw new Error("Unable to find the requested Webflow page.");
    }
    await this.api.switchPage(targetPage);
  }

  async createPage(input: CreatePageInput): Promise<WebflowSitePage> {
    if (!this.api.createPage) {
      throw new Error("This version of the Webflow Designer API cannot create pages.");
    }
    const previousPage = await this.api.getCurrentPage().catch(() => null);
    const page = await this.api.createPage();
    if (!page) {
      throw new Error("Webflow did not return the created page.");
    }
    if (page.setName) {
      await page.setName(input.name);
    }
    if (input.slug && page.setSlug) {
      await page.setSlug(input.slug.replace(/^\/+/, ""));
    }
    if (input.switchToNewPage && this.api.switchPage) {
      await this.api.switchPage(page);
    } else if (!input.switchToNewPage && previousPage?.id && this.api.switchPage) {
      await this.api.switchPage(previousPage).catch(() => undefined);
    }

    const name =
      (await page.getName?.().catch(() => null)) ??
      page.name ??
      input.name;
    const slug =
      (await page.getSlug?.().catch(() => null)) ??
      page.slug ??
      input.slug ??
      null;
    const isHomepage =
      (await page.getIsHomepage?.().catch(() => false)) ??
      page.isHomepage ??
      false;

    return {
      id: page.id,
      name,
      route: slugToRoute(slug, isHomepage),
      isHomepage
    };
  }

  async listStyleIds(): Promise<Array<{ name: string; id: string }>> {
    const styles = await this.api.getAllStyles();
    const entries = await Promise.all(
      styles.map(async (style) => {
        const name = await style.getName().catch(() => null);
        return name && typeof style.id === "string" ? { name, id: style.id } : null;
      })
    );
    return entries.filter((entry): entry is { name: string; id: string } => entry !== null);
  }

  async dedupeSelectionStyles(): Promise<{
    scanned: number;
    updatedElements: number;
    swappedClasses: string[];
  }> {
    const root = await this.api.getSelectedElement();
    if (!root) {
      throw new Error("Select the pasted section on the canvas first.");
    }

    // Project styles by name, so "padding-global 2" can be swapped to the real
    // "padding-global". Only styles whose base name actually exists are touched.
    const allStyles = await this.api.getAllStyles();
    const stylesByName = new Map<string, WebflowStyle>();
    await Promise.all(
      allStyles.map(async (style) => {
        const name = await style.getName().catch(() => null);
        if (name) {
          stylesByName.set(name, style);
        }
      })
    );

    const DUPLICATE_NAME = /^(.+?) (\d+)$/;
    const swappedClasses = new Set<string>();
    let scanned = 0;
    let updatedElements = 0;

    const visit = async (element: WebflowElement): Promise<void> => {
      scanned += 1;
      const styles = await element.getStyles?.().catch(() => null);
      if (styles && styles.length > 0) {
        let changed = false;
        const mapped: WebflowStyle[] = [];
        for (const style of styles) {
          const name = await style.getName().catch(() => null);
          const match = name ? DUPLICATE_NAME.exec(name) : null;
          const base = match ? stylesByName.get(match[1]) : undefined;
          if (name && base && base.id !== style.id) {
            mapped.push(base);
            swappedClasses.add(name);
            changed = true;
          } else {
            mapped.push(style);
          }
        }
        if (changed) {
          await element.setStyles?.(mapped);
          updatedElements += 1;
        }
      }
      const children = (await element.getChildren?.().catch(() => [])) ?? [];
      for (const child of children) {
        await visit(child);
      }
    };

    await visit(root);
    return { scanned, updatedElements, swappedClasses: [...swappedClasses].sort() };
  }

  private tokenValueMap: Map<string, { variable: WebflowVariable; name: string; kind: TokenKind }> | null =
    null;

  /**
   * The project's variables keyed by normalized value, cached for the session
   * (variables rarely change mid-migration; the first cleanup click warms it).
   * The variable's declared type wins over the value-inferred kind when present.
   */
  private async getTokenValueMap(): Promise<
    Map<string, { variable: WebflowVariable; name: string; kind: TokenKind }>
  > {
    if (this.tokenValueMap) {
      return this.tokenValueMap;
    }
    const map = new Map<string, { variable: WebflowVariable; name: string; kind: TokenKind }>();
    const collection = await this.api.getDefaultVariableCollection();
    for (const variable of (await collection?.getAllVariables()) ?? []) {
      const [name, value] = await Promise.all([
        variable.getName().catch(() => null),
        variable.get ? variable.get().catch(() => undefined) : Promise.resolve(undefined)
      ]);
      const literal = normalizeTokenLiteral(value);
      if (!name || !literal) {
        continue;
      }
      const declared = variable.type?.toLowerCase().replace(/[^a-z]/g, "");
      const kind: TokenKind =
        declared === "color"
          ? "color"
          : declared === "size"
            ? "size"
            : declared === "fontfamily"
              ? "fontFamily"
              : declared === "number" || declared === "percentage"
                ? "other"
                : literal.kind;
      if (!map.has(literal.normalized)) {
        map.set(literal.normalized, { variable, name, kind });
      }
    }
    this.tokenValueMap = map;
    return map;
  }

  async bindTokensInSelection(): Promise<{
    stylesScanned: number;
    boundProperties: number;
    bindings: string[];
  }> {
    const root = await this.api.getSelectedElement();
    if (!root) {
      throw new Error("Select the pasted section on the canvas first.");
    }
    const variablesByValue = await this.getTokenValueMap();
    if (variablesByValue.size === 0) {
      throw new Error("This site has no variables with bindable values.");
    }

    const processedStyleIds = new Set<string>();
    const bindings: string[] = [];
    let boundProperties = 0;

    const visit = async (element: WebflowElement): Promise<void> => {
      const styles = await element.getStyles?.().catch(() => null);
      for (const style of styles ?? []) {
        if (!style.getProperties || !style.setProperty || processedStyleIds.has(style.id)) {
          continue;
        }
        processedStyleIds.add(style.id);
        const properties = await style.getProperties().catch(() => null);
        if (!properties) {
          continue;
        }
        const styleName = await style.getName().catch(() => null);
        for (const [property, rawValue] of Object.entries(properties)) {
          // Only plain string literals are rebound — a value that is already a
          // variable reference comes back as an object and is skipped.
          if (typeof rawValue !== "string") {
            continue;
          }
          const literal = normalizeTokenLiteral(rawValue);
          if (!literal || TRIVIAL_TOKEN_VALUES.has(literal.normalized)) {
            continue;
          }
          const match = variablesByValue.get(literal.normalized);
          if (!match || !tokenKindMatchesProperty(match.kind, property)) {
            continue;
          }
          await style.setProperty(property, match.variable);
          boundProperties += 1;
          bindings.push(`${styleName ?? style.id}.${property} → ${match.name}`);
        }
      }
      const children = (await element.getChildren?.().catch(() => [])) ?? [];
      for (const child of children) {
        await visit(child);
      }
    };

    await visit(root);
    return { stylesScanned: processedStyleIds.size, boundProperties, bindings };
  }

  async inspectSharedStyles(siteId: string): Promise<SharedStyleContext> {
    const [styles, collection] = await Promise.all([
      this.api.getAllStyles(),
      this.api.getDefaultVariableCollection()
    ]);

    for (const style of styles) {
      this.stylesById.set(style.id, style);
    }

    const classes = await Promise.all(
      styles.map(async (style) => {
        const name = await style.getName();
        this.stylesByName.set(name, style);
        return {
          name,
          category: inferSharedCategory(name) ?? "custom"
        };
      })
    );

    const variables = collection
      ? await Promise.all(
          (await collection.getAllVariables()).map(async (variable) => {
            const [name, value] = await Promise.all([
              variable.getName(),
              variable.get ? variable.get().catch(() => undefined) : Promise.resolve(undefined)
            ]);
            return {
              name,
              category: categorizeVariable(name, variable.type),
              value:
                typeof value === "string" || typeof value === "number"
                  ? String(value)
                  : undefined
            };
          })
        )
      : [];

    return {
      siteId,
      capturedAt: new Date().toISOString(),
      classes,
      variables,
      styleIds: dedupe(styles.map((style) => style.id))
    };
  }

  async createNode(input: CreateNodeInput): Promise<{ id: string }> {
    const { parent, after } = await this.resolveAnchor(input);
    const presetOrTag = this.getInsertionSpec(input.node);
    let created: WebflowElement | null = null;

    if (after) {
      created = await after.after(presetOrTag);
    } else if (canAppendChildren(parent)) {
      created = await parent.append(presetOrTag);
    } else {
      throw new Error(
        "No valid insertion target in the current Designer selection. Select a section or container before building."
      );
    }

    if (
      created.type === "DOM" &&
      created.setTag &&
      typeof presetOrTag !== "string" &&
      presetOrTag !== this.api.elementPresets.TextBlock
    ) {
      await created.setTag(input.node.tag || "div");
    }

    const createdId = normalizeElementId(created.id);
    const preferredCreatedHandle =
      this.isTextBlockNode(input.node) && createdId
        ? (await this.getLiveElementHandle(createdId)) ?? created
        : created;

    const id = this.registerElement(preferredCreatedHandle);
    if (!id) {
      throw new Error("Created Webflow element is missing an id.");
    }

    if (input.node.textContent) {
      await this.setElementTextContent(id, preferredCreatedHandle, input.node.textContent);
    }

    if (input.node.tag === "img") {
      await this.setSafeImageAlt(
        preferredCreatedHandle,
        input.node.label ?? input.node.textContent ?? ""
      );
    }
    return { id };
  }

  async createComponentInstance(
    input: CreateComponentInstanceInput
  ): Promise<{ id: string }> {
    const component = await this.findComponentById(input.componentId);
    if (!component) {
      throw new Error("Unable to find the requested Webflow component.");
    }
    const { parent, after } = await this.resolveAnchor({
      parentId: input.parentId,
      afterId: input.afterId,
      node: {
        id: input.componentId,
        type: "box",
        tag: "div",
        classNames: [],
        children: []
      }
    });
    const created =
      after ? await after.after(component) : await parent?.append(component);
    const id = this.registerElement(created ?? null);
    if (!id) {
      throw new Error("Webflow did not return a created component instance.");
    }
    return { id };
  }

  async openComponentCanvas(componentId: string): Promise<void> {
    if (!this.api.openCanvas) {
      throw new Error("This version of the Webflow Designer API cannot open component canvases.");
    }
    await this.api.openCanvas({ componentId });
  }

  async exitComponentCanvas(): Promise<void> {
    if (!this.api.exitComponent) {
      return;
    }
    await this.api.exitComponent();
  }

  async getComponentRootElement(componentId: string): Promise<{ id: string } | null> {
    const component = await this.findComponentById(componentId);
    const root = await component?.getRootElement?.().catch(() => null);
    const id = this.registerElement(root ?? null);
    return id ? { id } : null;
  }

  async setNodeTextContent(nodeId: string, content: string): Promise<void> {
    const element = await this.getLiveElementHandle(nodeId);
    if (!element) {
      throw new Error("Unable to find the requested Webflow element.");
    }
    await this.setElementTextContent(nodeId, element, content);
  }

  async configureNode(
    nodeId: string,
    node: Pick<BuildNode, "tag" | "classNames" | "textContent">
  ): Promise<void> {
    const element = this.elementsById.get(nodeId);
    if (!element) {
      throw new Error("Unable to find the requested Webflow element.");
    }
    await element.setTag?.(node.tag);
    if (typeof node.textContent === "string") {
      await element.setTextContent?.(node.textContent);
    }
    if (node.classNames.length > 0) {
      await this.applyClasses(nodeId, node.classNames);
    }
  }

  async registerBlankComponent(input: {
    name: string;
    group?: string;
    description?: string;
  }): Promise<RegisteredComponent> {
    if (!this.api.registerComponent) {
      throw new Error("This version of the Webflow Designer API cannot create components.");
    }
    const component = await this.api.registerComponent({
      name: input.name,
      group: input.group,
      description: input.description
    });
    return {
      id: component.id,
      name: (await component.getName().catch(() => input.name)) ?? input.name
    };
  }

  async registerComponentFromNode(
    nodeId: string,
    input: {
      name: string;
      group?: string;
      description?: string;
      replace?: boolean;
    }
  ): Promise<RegisteredComponent> {
    if (!this.api.registerComponent) {
      throw new Error("This version of the Webflow Designer API cannot create components.");
    }
    const node = this.elementsById.get(nodeId);
    if (!node) {
      throw new Error("Unable to find the Webflow element for component registration.");
    }
    const component = await this.api.registerComponent(
      {
        name: input.name,
        group: input.group,
        description: input.description,
        replace: input.replace ?? false
      },
      node
    );
    return {
      id: component.id,
      name: (await component.getName().catch(() => input.name)) ?? input.name
    };
  }

  async applyClasses(nodeId: string, classNames: string[]): Promise<void> {
    const element = this.elementsById.get(nodeId);
    if (!element || !element.setStyles || !element.styles) {
      throw new Error(`Unable to apply styles to node ${nodeId}.`);
    }

    const builderClassNames = classNames.filter(
      (className) => !isReservedStyleGuideClassName(className)
    );
    if (builderClassNames.length === 0) {
      return;
    }

    const styles = await Promise.all(builderClassNames.map((className) => this.getOrCreateStyle(className)));
    await element.setStyles(styles);
  }

  async ensureStyle(
    className: string,
    properties: Record<string, string>
  ): Promise<{ styleId: string }> {
    if (isReservedStyleGuideClassName(className)) {
      throw new Error(`Reserved style guide classes cannot be applied: ${className}`);
    }
    const style = await this.getOrCreateStyle(className);
    if (style.setProperties) {
      await style.setProperties(properties);
    } else if (style.setProperty) {
      for (const [property, value] of Object.entries(properties)) {
        await style.setProperty(property, value);
      }
    }
    return { styleId: style.id };
  }

  async bindVariable(
    nodeId: string,
    property: string,
    variableName: string,
    value?: string
  ): Promise<void> {
    const element = this.elementsById.get(nodeId);
    if (!element) {
      throw new Error(`Unknown node for variable binding: ${nodeId}`);
    }

    const collection = await this.api.getDefaultVariableCollection();
    let variable = await collection?.getVariableByName(variableName);
    if (!variable && value && collection) {
      // Fall back to matching an existing variable by value when the token name
      // doesn't line up with the target site's variable names.
      const normalized = value.trim().toLowerCase();
      for (const candidate of await collection.getAllVariables()) {
        const candidateValue = candidate.get
          ? await candidate.get().catch(() => undefined)
          : undefined;
        if (
          (typeof candidateValue === "string" || typeof candidateValue === "number") &&
          String(candidateValue).trim().toLowerCase() === normalized
        ) {
          variable = candidate;
          break;
        }
      }
    }
    const style = await this.getLastAppliedStyle(element);
    if (!variable || !style?.setProperty) {
      return;
    }
    await style.setProperty(property, variable);
  }

  async setNodeAttribute(nodeId: string, name: string, value: string): Promise<void> {
    const element = this.elementsById.get(nodeId);
    if (!element) {
      return;
    }
    if (element.setCustomAttribute) {
      await element.setCustomAttribute(name, value);
    } else if (element.setAttribute) {
      await element.setAttribute(name, value);
    }
  }

  async bindAsset(
    nodeId: string,
    source: string,
    fallback: "placeholder" | "warning-only"
  ): Promise<{ resolved: boolean }> {
    const element = this.elementsById.get(nodeId);
    if (!element) {
      throw new Error(`Unknown node for asset binding: ${nodeId}`);
    }

    const asset = await this.findAsset(source);
    const altText = this.getAssetLabel(source);

    if (asset) {
      if (element.type === "Image" && element.setAsset) {
        await element.setAsset(asset);
        await this.setSafeImageAlt(element, altText);
        return { resolved: true };
      }

      if (element.setAttribute) {
        await element.setAttribute("src", await asset.getUrl());
        await this.setSafeImageAlt(element, altText);
        return { resolved: true };
      }
    }

    if (fallback === "placeholder") {
      const placeholderAsset =
        element.type === "Image" ? await this.createPlaceholderAsset() : null;
      if (placeholderAsset && element.setAsset) {
        await element.setAsset(placeholderAsset);
        await this.setSafeImageAlt(element, "Missing asset placeholder");
        return { resolved: false };
      }

      if (element.setAttribute) {
        await element.setAttribute(
          "src",
          "https://placehold.co/1200x800/png?text=Asset+Missing"
        );
        await this.setSafeImageAlt(element, "Missing asset placeholder");
      }
    }

    return { resolved: false };
  }

  async deleteNodes(nodeIds: string[]): Promise<void> {
    for (const nodeId of nodeIds) {
      const element = this.elementsById.get(nodeId);
      if (element?.remove) {
        await element.remove();
      }
      this.elementsById.delete(nodeId);
    }
  }

  async deleteStyles(styleIds: string[]): Promise<void> {
    for (const styleId of styleIds) {
      const style = this.stylesById.get(styleId);
      if (style) {
        await this.api.removeStyle(style).catch(() => undefined);
        this.stylesById.delete(styleId);
      }
    }
  }
}

class MockWebflowDesignerBridge implements WebflowDesignerBridge {
  private readonly createdNodes = new Map<string, BuildNode>();
  private readonly createdStyles = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private nodeCount = 0;
  private currentPageId = "mock-page-home";
  private pages: WebflowSitePage[] = [
    {
      id: "mock-page-home",
      name: "Home",
      route: "/",
      isHomepage: true
    },
    {
      id: "mock-page-services",
      name: "Services",
      route: "/services",
      isHomepage: false
    }
  ];

  async getContext(): Promise<DesignerContext> {
    const currentPage =
      this.pages.find((page) => page.id === this.currentPageId) ?? this.pages[0];
    return {
      siteId: "6a2db2a041dabacd48068930",
      siteName: "MIS Inc AI Builder",
      siteDomain: "misinc-ai-builder.webflow.io",
      pageId: currentPage?.id ?? null,
      pageName: currentPage?.name ?? null,
      mode: "design",
      selectedElementId: "mock-selected-section"
    };
  }

  async getSitePages(): Promise<WebflowSitePage[]> {
    return this.pages;
  }

  subscribeToCurrentPage(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async switchToPage(pageId: string): Promise<void> {
    if (this.pages.some((page) => page.id === pageId)) {
      this.currentPageId = pageId;
      this.listeners.forEach((listener) => listener());
    }
  }

  async createPage(input: CreatePageInput): Promise<WebflowSitePage> {
    const previousPageId = this.currentPageId;
    const page: WebflowSitePage = {
      id: `mock-page-${Date.now().toString(36)}`,
      name: input.name,
      route: slugToRoute(input.slug ?? input.name.toLowerCase().replace(/\s+/g, "-")),
      isHomepage: false
    };
    this.pages = [...this.pages, page];
    if (input.switchToNewPage) {
      this.currentPageId = page.id;
    } else if (previousPageId) {
      this.currentPageId = previousPageId;
    }
    if (input.switchToNewPage || previousPageId) {
      this.listeners.forEach((listener) => listener());
    }
    return page;
  }

  async listStyleIds(): Promise<Array<{ name: string; id: string }>> {
    return [];
  }

  async dedupeSelectionStyles(): Promise<{
    scanned: number;
    updatedElements: number;
    swappedClasses: string[];
  }> {
    return { scanned: 0, updatedElements: 0, swappedClasses: [] };
  }

  async bindTokensInSelection(): Promise<{
    stylesScanned: number;
    boundProperties: number;
    bindings: string[];
  }> {
    return { stylesScanned: 0, boundProperties: 0, bindings: [] };
  }

  async inspectSharedStyles(siteId: string): Promise<SharedStyleContext> {
    return {
      siteId,
      capturedAt: new Date().toISOString(),
      classes: [
        { name: "padding-global", category: "layout" },
        { name: "container-large", category: "layout" },
        { name: "padding-section-large", category: "spacing" },
        { name: "heading-style-h1", category: "heading" },
        { name: "heading-style-h2", category: "heading" },
        { name: "heading-style-h4", category: "heading" },
        { name: "text-size-small", category: "text" },
        { name: "text-size-medium", category: "text" },
        { name: "text-size-regular", category: "text" },
        { name: "button", category: "button" },
        { name: "button-secondary", category: "button" }
      ],
      variables: [
        { name: "space-large", category: "spacing", value: "64px" },
        { name: "color-brand", category: "color", value: "#0f4c5c" }
      ],
      styleIds: []
    };
  }

  async createNode(input: CreateNodeInput): Promise<{ id: string }> {
    const id = `mock-node-${++this.nodeCount}`;
    this.createdNodes.set(id, input.node);
    return { id };
  }

  async createComponentInstance(
    _input: CreateComponentInstanceInput
  ): Promise<{ id: string }> {
    return { id: `mock-component-instance-${++this.nodeCount}` };
  }

  async openComponentCanvas(): Promise<void> {}

  async exitComponentCanvas(): Promise<void> {}

  async getComponentRootElement(componentId: string): Promise<{ id: string } | null> {
    return { id: `mock-component-root-${componentId}` };
  }

  async setNodeTextContent(): Promise<void> {}
  async setNodeAttribute(): Promise<void> {}

  async configureNode(): Promise<void> {}

  async registerBlankComponent(input: {
    name: string;
    group?: string;
    description?: string;
  }): Promise<RegisteredComponent> {
    return {
      id: `mock-component-${Date.now().toString(36)}`,
      name: input.name
    };
  }

  async registerComponentFromNode(
    _nodeId: string,
    input: {
      name: string;
      group?: string;
      description?: string;
      replace?: boolean;
    }
  ): Promise<RegisteredComponent> {
    return {
      id: `mock-component-${Date.now().toString(36)}`,
      name: input.name
    };
  }

  async applyClasses(): Promise<void> {}

  async ensureStyle(
    className: string,
    properties: Record<string, string>
  ): Promise<{ styleId: string }> {
    const styleId = `style:${className}:${Object.keys(properties).length}`;
    this.createdStyles.add(styleId);
    return { styleId };
  }

  async bindVariable(): Promise<void> {}

  async bindAsset(
    _nodeId: string,
    source: string,
    fallback: "placeholder" | "warning-only"
  ): Promise<{ resolved: boolean }> {
    return {
      resolved: fallback !== "placeholder" && !source.includes("/")
    };
  }

  async deleteNodes(nodeIds: string[]): Promise<void> {
    nodeIds.forEach((id) => this.createdNodes.delete(id));
  }

  async deleteStyles(styleIds: string[]): Promise<void> {
    styleIds.forEach((id) => this.createdStyles.delete(id));
  }
}

export function getWebflowBridge(): WebflowDesignerBridge {
  if (window.__WEBFLOW_SECTION_BUILDER_BRIDGE__) {
    const injected = window.__WEBFLOW_SECTION_BUILDER_BRIDGE__;
    return {
      ...injected,
      subscribeToCurrentPage:
        injected.subscribeToCurrentPage ?? (() => () => {}),
      switchToPage: injected.switchToPage ?? (async () => undefined),
      createPage:
        injected.createPage ??
        (async () => {
          throw new Error("Injected bridge does not implement createPage().");
        }),
      createComponentInstance:
        injected.createComponentInstance ??
        (async () => {
          throw new Error("Injected bridge does not implement createComponentInstance().");
        }),
      openComponentCanvas:
        injected.openComponentCanvas ??
        (async () => {
          throw new Error("Injected bridge does not implement openComponentCanvas().");
        }),
      exitComponentCanvas:
        injected.exitComponentCanvas ?? (async () => undefined),
      getComponentRootElement:
        injected.getComponentRootElement ??
        (async () => {
          throw new Error("Injected bridge does not implement getComponentRootElement().");
        }),
      configureNode:
        injected.configureNode ??
        (async () => {
          throw new Error("Injected bridge does not implement configureNode().");
        }),
      registerBlankComponent:
        injected.registerBlankComponent ??
        (async () => {
          throw new Error("Injected bridge does not implement registerBlankComponent().");
        }),
      registerComponentFromNode:
        injected.registerComponentFromNode ??
        (async () => {
          throw new Error("Injected bridge does not implement registerComponentFromNode().");
        })
    };
  }

  const api = window.webflow ?? window.Webflow;
  if (api) {
    return new RealWebflowDesignerBridge(api);
  }

  return new MockWebflowDesignerBridge();
}

export function getWebflowBridgeLabel(): string {
  if (window.__WEBFLOW_SECTION_BUILDER_BRIDGE__) {
    return "Injected bridge";
  }
  if (window.webflow ?? window.Webflow) {
    return "Webflow Designer API";
  }
  return "Local mock bridge";
}
