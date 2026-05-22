import { describe, expect, it } from "vitest";
import { executeBuildPlan } from "../extension/src/executor/buildExecutor.js";
import { BuildPlan } from "../src/shared/contracts.js";
import {
  DesignerContext,
  WebflowDesignerBridge
} from "../extension/src/webflow/bridge.js";

class FailingBridge implements WebflowDesignerBridge {
  public deletedNodes: string[] = [];

  async getContext() {
    return {
      siteId: "site-1",
      pageId: "page-1",
      mode: "designer",
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

  async createNode() {
    return { id: "node-1" };
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
});
