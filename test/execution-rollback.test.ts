import { describe, expect, it } from "vitest";
import type { ExecutionSummary } from "../extension/src/executor/buildExecutor.js";
import {
  mergeExecutionSummaries,
  rollbackExecutionSummary
} from "../extension/src/v2/context/executionRollback.js";
import type {
  DesignerContext,
  WebflowDesignerBridge
} from "../extension/src/webflow/bridge.js";

class TrackingBridge implements WebflowDesignerBridge {
  public deletedNodes: string[][] = [];
  public deletedStyles: string[][] = [];

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

  async ensureStyle() {
    return { styleId: "style-1" };
  }

  async bindVariable() {}

  async bindAsset() {
    return { resolved: true };
  }

  async deleteNodes(nodeIds: string[]) {
    this.deletedNodes.push(nodeIds);
  }

  async deleteStyles(styleIds: string[]) {
    this.deletedStyles.push(styleIds);
  }
}

describe("execution rollback helpers", () => {
  it("merges partial execution summaries for rollback tracking", () => {
    const first: ExecutionSummary = {
      success: true,
      createdNodeIds: ["component-instance-1", "seed-child-1"],
      createdStyleIds: [],
      reusedClasses: ["section"],
      createdClasses: [],
      warnings: [],
      missingAssets: [],
      rollbackOutcome: null,
      rootNodeId: "component-instance-1"
    };
    const second: ExecutionSummary = {
      success: true,
      createdNodeIds: [],
      createdStyleIds: ["style-1", "style-2"],
      reusedClasses: [],
      createdClasses: ["hero_component"],
      warnings: [
        {
          code: "warn",
          message: "A warning",
          level: "warning"
        }
      ],
      missingAssets: ["asset.png"],
      rollbackOutcome: null,
      rootNodeId: "component-instance-1"
    };

    expect(mergeExecutionSummaries([first, second])).toEqual({
      success: true,
      createdNodeIds: ["component-instance-1", "seed-child-1"],
      createdStyleIds: ["style-1", "style-2"],
      reusedClasses: ["section"],
      createdClasses: ["hero_component"],
      warnings: second.warnings,
      missingAssets: ["asset.png"],
      rollbackOutcome: null,
      rootNodeId: "component-instance-1"
    });
  });

  it("rolls back styles and nodes in reverse node order", async () => {
    const bridge = new TrackingBridge();
    await rollbackExecutionSummary(bridge, {
      success: true,
      createdNodeIds: ["component-instance-1", "seed-child-1", "seed-child-2"],
      createdStyleIds: ["style-1", "style-2"],
      reusedClasses: [],
      createdClasses: [],
      warnings: [],
      missingAssets: [],
      rollbackOutcome: null,
      rootNodeId: "component-instance-1"
    });

    expect(bridge.deletedNodes).toEqual([
      ["seed-child-2", "seed-child-1", "component-instance-1"]
    ]);
    expect(bridge.deletedStyles).toEqual([["style-1", "style-2"]]);
  });
});
