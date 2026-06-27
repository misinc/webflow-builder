import { describe, expect, it } from "vitest";
import {
  applyStylingPlan,
  executeBuildPlan,
  executeSkeletonPlan
} from "../extension/src/executor/buildExecutor.js";
import { BuildPlan } from "@wfb/shared/contracts.js";
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

  async setNodeTextContent(_nodeId: string, _content: string) {}

  async configureNode() {}

  async registerBlankComponent() {
    return { id: "component-1", name: "Component" };
  }

  async registerComponentFromNode() {
    return { id: "component-1", name: "Component" };
  }

  async applyClasses(_nodeId: string, _classNames: string[]) {}

  async ensureStyle(
    _className: string,
    _properties: Record<string, string>
  ): Promise<{ styleId: string }> {
    throw new Error("style failure");
  }

  async bindVariable() {}

  async bindAsset(
    _nodeId: string,
    _source: string,
    _fallback: "placeholder" | "warning-only"
  ) {
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
        assetBindings: [],
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
    expect(root?.childIds).toEqual([result.createdNodeIds[1], result.createdNodeIds[2]]);
    expect(firstChild?.afterCalls).toEqual([]);
    expect(selected.childIds).toEqual([rootId]);
  });

  it("reapplies node text after classes are attached", async () => {
    const textContentCalls: string[] = [];

    class TextBridge extends FailingBridge {
      override async createNode() {
        return { id: "text-node-1" };
      }

      override async applyClasses() {}

      override async setNodeTextContent(_nodeId: string, content: string) {
        textContentCalls.push(content);
      }
    }

    const bridge = new TextBridge();
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
        treeText: "section.hero\n  div.text-style-tagline \"FOUNDED IN 1995\"",
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
              classNames: ["text-style-tagline"],
              textContent: "FOUNDED IN 1995",
              children: []
            }
          ]
        },
        assetBindings: [],
        reusableClasses: [],
        suggestedNewClasses: [],
        warnings: []
      }
    });

    expect(result.success).toBe(true);
    expect(
      textContentCalls.filter((content) => content === "FOUNDED IN 1995")
    ).toHaveLength(2);
  });

  it("applies skeleton asset bindings during insertion", async () => {
    class AssetBridge extends FailingBridge {
      public bindCalls: Array<{ nodeId: string; source: string }> = [];

      override async createNode() {
        return { id: "image-node-1" };
      }

      override async applyClasses() {}

      override async bindAsset(
        nodeId: string,
        source: string,
        _fallback: "placeholder" | "warning-only"
      ) {
        this.bindCalls.push({ nodeId, source });
        return { resolved: false };
      }
    }

    const bridge = new AssetBridge();
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
          sectionName: "Attorneys",
          sourceFile: "Attorneys.tsx"
        },
        treeText: "section.section_attorneys\n  img.attorneys_image",
        elementTree: {
          id: "root",
          type: "section",
          tag: "section",
          classNames: ["section_attorneys"],
          children: [
            {
              id: "image-1",
              type: "image",
              tag: "img",
              classNames: ["attorneys_image"],
              children: []
            }
          ]
        },
        assetBindings: [
          {
            nodeId: "image-1",
            source: "../../assets/Mark Windsor.jpg",
            fallback: "placeholder"
          }
        ],
        reusableClasses: [],
        suggestedNewClasses: [],
        warnings: []
      }
    });

    expect(bridge.bindCalls).toEqual([
      {
        nodeId: "image-node-1",
        source: "../../assets/Mark Windsor.jpg"
      }
    ]);
    expect(result.missingAssets).toEqual(["../../assets/Mark Windsor.jpg"]);
  });

  it("retries transient idempotent node operations without retrying createNode", async () => {
    class RetryBridge extends FailingBridge {
      public createNodeCalls = 0;
      public applyClassesCalls = 0;

      override async createNode() {
        this.createNodeCalls += 1;
        return { id: "retry-node-1" };
      }

      override async applyClasses() {
        this.applyClassesCalls += 1;
        if (this.applyClassesCalls === 1) {
          throw new Error("temporary Designer API timeout");
        }
      }
    }

    const bridge = new RetryBridge();
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
        treeText: "section.hero",
        elementTree: {
          id: "root",
          type: "section",
          tag: "section",
          classNames: ["hero"],
          children: []
        },
        assetBindings: [],
        reusableClasses: [],
        suggestedNewClasses: [],
        warnings: []
      }
    });

    expect(result.success).toBe(true);
    expect(bridge.createNodeCalls).toBe(1);
    expect(bridge.applyClassesCalls).toBe(2);
  });

  it("skips reserved Relume styleguide classes during styling execution", async () => {
    class RecordingBridge extends FailingBridge {
      public appliedClassNames: string[][] = [];
      public ensuredClassNames: string[] = [];

      override async applyClasses(_nodeId: string, classNames: string[]) {
        this.appliedClassNames.push(classNames);
      }

      override async ensureStyle(className: string) {
        this.ensuredClassNames.push(className);
        return { styleId: `style-${className}` };
      }
    }

    const bridge = new RecordingBridge();
    const context = await bridge.getContext();
    const result = await applyStylingPlan({
      bridge,
      context,
      targetNodeId: "root-node",
      plan: {
        sectionMetadata: {
          repoId: "repo-1",
          pageId: "page-1",
          sectionId: "section-1",
          pageName: "Home",
          sectionName: "Hero",
          sourceFile: "Hero.tsx"
        },
        mode: "fullAssist",
        styleDefinitions: [
          {
            className: "rl-styleguide_component",
            properties: { display: "grid" },
            shared: false
          },
          {
            className: "hero_component",
            properties: { display: "grid" },
            shared: false
          }
        ],
        variableBindings: [],
        reusableClasses: [],
        suggestedNewClasses: [],
        requiredClassNames: ["rl-styleguide_item", "hero_component"],
        notes: [],
        warnings: []
      }
    });

    expect(result.success).toBe(true);
    expect(bridge.ensuredClassNames).toEqual(["hero_component"]);
    expect(bridge.appliedClassNames).toEqual([["hero_component"]]);
    expect(result.createdClasses).toEqual(["hero_component"]);
    expect(result.warnings.some((warning) => warning.code === "reserved-styleguide-class-skipped")).toBe(true);
  });
});
