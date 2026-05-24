import { describe, expect, it } from "vitest";
import {
  executeBuildPlan,
  executeSkeletonPlan
} from "../extension/src/executor/buildExecutor.js";
import { BuildPlan } from "../src/shared/contracts.js";
import {
  DesignerContext,
  getWebflowBridge,
  WebflowDesignerBridge
} from "../extension/src/webflow/bridge.js";

class FailingBridge implements WebflowDesignerBridge {
  public deletedNodes: string[] = [];

  async getContext() {
    return {
      siteId: "site-1",
      siteName: "Test Site",
      pageId: "page-1",
      pageName: "Home",
      mode: "design",
      selectedElementId: null
    } satisfies DesignerContext;
  }

  async inspectSharedStyles() {
    return {
      siteId: "site-1",
      capturedAt: new Date().toISOString(),
      classes: [],
      variables: [],
      styleIds: []
    };
  }

  async getSitePages() {
    return [];
  }

  subscribeToCurrentPage() {
    return () => {};
  }

  async switchToPage() {}

  async createPage() {
    return {
      id: "page-2",
      name: "Created page",
      route: "/created-page",
      isHomepage: false
    };
  }

  async createNode() {
    return { id: "node-1" };
  }

  async createComponentInstance() {
    return { id: "component-instance-1" };
  }

  async openComponentCanvas() {}

  async exitComponentCanvas() {}

  async getComponentRootElement() {
    return { id: "component-root-1" };
  }

  async configureNode() {}

  async registerBlankComponent() {
    return { id: "component-1", name: "Component" };
  }

  async registerComponentFromNode() {
    return { id: "component-1", name: "Component" };
  }

  async applyClasses() {}

  async ensureStyle(
    _className: string,
    _properties: Record<string, string>
  ): Promise<{ styleId: string }> {
    throw new Error("style failure");
  }

  async bindVariable() {}

  async bindAsset() {
    return { resolved: false };
  }

  async deleteNodes(nodeIds: string[]) {
    this.deletedNodes.push(...nodeIds);
  }

  async deleteStyles() {}
}

describe("executeBuildPlan", () => {
  it("attempts rollback when execution fails after node creation", async () => {
    const bridge = new FailingBridge();
    const context = await bridge.getContext();
    const plan: BuildPlan = {
      sectionMetadata: {
        repoId: "repo-1",
        pageId: "page-1",
        sectionId: "section-1",
        pageName: "Home",
        sectionName: "Hero",
        sourceFile: "Hero.tsx"
      },
      elementTree: {
        id: "root",
        type: "section",
        tag: "section",
        classNames: ["section_hero"],
        children: []
      },
      classAssignments: [
        {
          nodeId: "root",
          classNames: ["section_hero"],
          reused: [],
          created: ["section_hero"]
        }
      ],
      styleDefinitions: [
        {
          className: "section_hero",
          properties: { display: "block" },
          shared: false
        }
      ],
      variableBindings: [],
      assetBindings: [],
      warnings: []
    };

    const result = await executeBuildPlan({
      bridge,
      context,
      plan,
      placementMode: "append",
      placementTarget: null
    });

    expect(result.success).toBe(false);
    expect(result.rollbackOutcome?.attempted).toBe(true);
    expect(bridge.deletedNodes).toEqual(["node-1"]);
  });

  it("inserts nested skeleton children under the created root", async () => {
    type MockElement = {
      id: string;
      type: string;
      children?: boolean;
      styles?: boolean;
      childIds: string[];
      afterCalls: string[];
      append: (presetOrTag: unknown) => Promise<MockElement>;
      after: (presetOrTag: unknown) => Promise<MockElement>;
      setTag: (tag: string) => Promise<void>;
      setTextContent: (content: string) => Promise<void>;
      setStyles: () => Promise<null>;
      getStyles: () => Promise<[]>;
      remove: () => Promise<null>;
    };

    let elementCount = 0;
    const elements = new Map<string, MockElement>();

    function createElement(id: string, type = "DOM", canContainChildren?: boolean): MockElement {
      const element: MockElement = {
        id,
        type,
        childIds: [],
        afterCalls: [],
        children: canContainChildren,
        styles: true,
        append: async () => {
          const child = createElement(`node-${++elementCount}`);
          element.childIds.push(child.id);
          return child;
        },
        after: async () => {
          const sibling = createElement(`node-${++elementCount}`);
          element.afterCalls.push(sibling.id);
          return sibling;
        },
        setTag: async () => undefined,
        setTextContent: async () => undefined,
        setStyles: async () => null,
        getStyles: async () => [],
        remove: async () => null
      };
      elements.set(id, element);
      return element;
    }

    const selected = createElement("selected-root", "DOM", true);
    let styleCount = 0;
    const mockApi = {
      elementPresets: {
        DOM: {}
      },
      getSiteInfo: async () => ({ siteId: "site-1", name: "Test Site" }),
      getCurrentPage: async () => ({
        id: "page-1",
        getName: async () => "Home"
      }),
      getCurrentMode: async () => "design",
      getSelectedElement: async () => selected,
      getAllStyles: async () => [],
      getStyleByName: async () => null,
      createStyle: async (name: string) => ({
        id: `style-${++styleCount}`,
        getName: async () => name,
        setProperties: async () => undefined
      }),
      removeStyle: async () => undefined,
      getDefaultVariableCollection: async () => null,
      getAllAssets: async () => []
    };

    Object.defineProperty(globalThis, "window", {
      value: {
        webflow: mockApi
      },
      configurable: true
    });

    const bridge = getWebflowBridge();
    const context = await bridge.getContext();

    const result = await executeSkeletonPlan({
      bridge,
      context,
      placementMode: "append",
      placementTarget: null,
      plan: {
        sectionMetadata: {
          repoId: "repo-1",
          pageId: "page-1",
          sectionId: "section-1",
          pageName: "Home",
          sectionName: "Hero",
          sourceFile: "Hero.tsx"
        },
        treeText: "section.hero\n  div.container\n  p.copy \"Hello\"",
        elementTree: {
          id: "root",
          type: "section",
          tag: "section",
          classNames: ["hero"],
          children: [
            {
              id: "child-1",
              type: "box",
              tag: "div",
              classNames: ["container"],
              children: []
            },
            {
              id: "child-2",
              type: "text",
              tag: "p",
              classNames: ["copy"],
              textContent: "Hello",
              children: []
            }
          ],
          textContent: undefined
        },
        reusableClasses: [],
        suggestedNewClasses: [],
        warnings: []
      }
    });

    expect(result.success).toBe(true);
    expect(result.createdNodeIds).toHaveLength(3);

    const rootId = result.rootNodeId!;
    const root = elements.get(rootId);
    const firstChild = elements.get(result.createdNodeIds[1]);
    expect(root?.childIds).toEqual([result.createdNodeIds[1]]);
    expect(firstChild?.afterCalls).toEqual([result.createdNodeIds[2]]);
    expect(selected.childIds).toEqual([rootId]);
  });
});
