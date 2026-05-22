import {
  BuildNode,
  BuildPlan,
  PlacementMode,
  PlannerWarning
} from "../../../src/shared/contracts.js";
import { DesignerContext, WebflowDesignerBridge } from "../webflow/bridge.js";

export interface ExecutionSummary {
  success: boolean;
  createdNodeIds: string[];
  createdStyleIds: string[];
  reusedClasses: string[];
  createdClasses: string[];
  warnings: PlannerWarning[];
  missingAssets: string[];
  rollbackOutcome: {
    attempted: boolean;
    successful: boolean;
    details: string;
  } | null;
}

async function buildNodeTree(params: {
  bridge: WebflowDesignerBridge;
  node: BuildNode;
  parentId: string | null;
  afterId: string | null;
  createdNodeIds: string[];
  nodeIdMap: Map<string, string>;
}): Promise<void> {
  const created = await params.bridge.createNode({
    parentId: params.parentId,
    afterId: params.afterId,
    node: params.node
  });
  params.createdNodeIds.push(created.id);
  params.nodeIdMap.set(params.node.id, created.id);
  await params.bridge.applyClasses(created.id, params.node.classNames);

  let lastChildId: string | null = null;
  for (const child of params.node.children) {
    await buildNodeTree({
      bridge: params.bridge,
      node: child,
      parentId: created.id,
      afterId: lastChildId,
      createdNodeIds: params.createdNodeIds,
      nodeIdMap: params.nodeIdMap
    });
    lastChildId = params.nodeIdMap.get(child.id) ?? null;
  }
}

export async function executeBuildPlan(params: {
  bridge: WebflowDesignerBridge;
  context: DesignerContext;
  plan: BuildPlan;
  placementMode: PlacementMode;
  placementTarget: string | null;
}): Promise<ExecutionSummary> {
  if (!params.context.siteId || !params.context.pageId) {
    throw new Error("No active Webflow site or page.");
  }
  if (!["design", "build", "edit"].includes(params.context.mode)) {
    throw new Error("Webflow Designer is not in editable mode.");
  }

  const anchorId =
    params.placementMode === "afterSelected"
      ? params.placementTarget ?? params.context.selectedElementId
      : null;
  if (params.placementMode === "afterSelected" && !anchorId) {
    throw new Error("Placement requires a selected element.");
  }

  const createdNodeIds: string[] = [];
  const createdStyleIds: string[] = [];
  const missingAssets: string[] = [];
  const executionWarnings: PlannerWarning[] = [];
  const nodeIdMap = new Map<string, string>();
  try {
    await buildNodeTree({
      bridge: params.bridge,
      node: params.plan.elementTree,
      parentId: params.context.pageId,
      afterId: anchorId,
      createdNodeIds,
      nodeIdMap
    });

    for (const styleDefinition of params.plan.styleDefinitions) {
      const style = await params.bridge.ensureStyle(
        styleDefinition.className,
        styleDefinition.properties
      );
      createdStyleIds.push(style.styleId);
    }

    for (const binding of params.plan.variableBindings) {
      const runtimeNodeId = nodeIdMap.get(binding.nodeId);
      if (!runtimeNodeId) continue;
      try {
        await params.bridge.bindVariable(
          runtimeNodeId,
          binding.property,
          binding.variableName
        );
      } catch (error) {
        executionWarnings.push({
          code: "variable-binding-skipped",
          message:
            error instanceof Error
              ? error.message
              : `Variable binding failed for ${binding.variableName}.`,
          level: "warning"
        });
      }
    }

    for (const assetBinding of params.plan.assetBindings) {
      const runtimeNodeId = nodeIdMap.get(assetBinding.nodeId);
      if (!runtimeNodeId) continue;
      const result = await params.bridge.bindAsset(
        runtimeNodeId,
        assetBinding.source,
        assetBinding.fallback
      );
      if (!result.resolved) {
        missingAssets.push(assetBinding.source);
      }
    }

    return {
      success: true,
      createdNodeIds,
      createdStyleIds,
      reusedClasses: params.plan.classAssignments.flatMap((item) => item.reused),
      createdClasses: params.plan.styleDefinitions.map((item) => item.className),
      warnings: [...params.plan.warnings, ...executionWarnings],
      missingAssets,
      rollbackOutcome: null
    };
  } catch (error) {
    let rollbackOutcome: ExecutionSummary["rollbackOutcome"] = null;
    try {
      await params.bridge.deleteNodes([...createdNodeIds].reverse());
      await params.bridge.deleteStyles(createdStyleIds);
      rollbackOutcome = {
        attempted: true,
        successful: true,
        details: "Created nodes and styles were removed after failure."
      };
    } catch (rollbackError) {
      rollbackOutcome = {
        attempted: true,
        successful: false,
        details:
          rollbackError instanceof Error
            ? rollbackError.message
            : "Rollback failed."
      };
    }

    return {
      success: false,
      createdNodeIds,
      createdStyleIds,
      reusedClasses: [],
      createdClasses: params.plan.styleDefinitions.map((item) => item.className),
      warnings: [
        ...params.plan.warnings,
        {
          code: "execution-failure",
          message:
            error instanceof Error ? error.message : "Build execution failed.",
          level: "error"
        }
      ],
      missingAssets,
      rollbackOutcome
    };
  }
}
