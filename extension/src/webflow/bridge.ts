import { BuildNode, SharedStyleContext } from "../../../src/shared/contracts.js";

export interface DesignerContext {
  siteId: string | null;
  pageId: string | null;
  mode: "designer" | "preview" | "unknown";
  selectedElementId: string | null;
}

export interface CreateNodeInput {
  parentId: string | null;
  afterId?: string | null;
  node: BuildNode;
}

export interface WebflowDesignerBridge {
  getContext(): Promise<DesignerContext>;
  inspectSharedStyles(siteId: string): Promise<SharedStyleContext>;
  createNode(input: CreateNodeInput): Promise<{ id: string }>;
  applyClasses(nodeId: string, classNames: string[]): Promise<void>;
  ensureStyle(
    className: string,
    properties: Record<string, string>
  ): Promise<{ styleId: string }>;
  bindVariable(
    nodeId: string,
    property: string,
    variableName: string
  ): Promise<void>;
  bindAsset(
    nodeId: string,
    source: string,
    fallback: "placeholder" | "warning-only"
  ): Promise<{ resolved: boolean }>;
  deleteNodes(nodeIds: string[]): Promise<void>;
  deleteStyles(styleIds: string[]): Promise<void>;
}

declare global {
  interface Window {
    __WEBFLOW_SECTION_BUILDER_BRIDGE__?: WebflowDesignerBridge;
  }
}

class MockWebflowDesignerBridge implements WebflowDesignerBridge {
  private readonly createdNodes = new Map<string, BuildNode>();
  private readonly createdStyles = new Set<string>();
  private nodeCount = 0;

  async getContext(): Promise<DesignerContext> {
    return {
      siteId: "6a10876cde32438bc9f52304",
      pageId: "mock-page-home",
      mode: "designer",
      selectedElementId: "mock-selected-section"
    };
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
  return window.__WEBFLOW_SECTION_BUILDER_BRIDGE__ ?? new MockWebflowDesignerBridge();
}
