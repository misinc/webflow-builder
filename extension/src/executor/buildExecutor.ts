import {
  BuildNode,
  BuildPlan,
  PlacementMode,
  PlannerWarning,
  SkeletonPlan,
  StylingPlan
} from "@wfb/shared/contracts.js";
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
  rootNodeId?: string | null;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  throw error;
}

async function buildNodeTree(params: {
  bridge: WebflowDesignerBridge;
  node: BuildNode;
  parentId: string | null;
  afterId: string | null;
  createdNodeIds: string[];
  nodeIdMap: Map<string, string>;
  signal?: AbortSignal | null;
}): Promise<void> {
  throwIfAborted(params.signal);
  const created = await params.bridge.createNode({
    parentId: params.parentId,
    afterId: params.afterId,
    node: params.node
  });
  params.createdNodeIds.push(created.id);
  params.nodeIdMap.set(params.node.id, created.id);
  throwIfAborted(params.signal);
  await params.bridge.applyClasses(created.id, params.node.classNames);
  if (typeof params.node.textContent === "string" && params.node.textContent.trim().length > 0) {
    throwIfAborted(params.signal);
    await params.bridge.setNodeTextContent(created.id, params.node.textContent);
  }

  let lastChildId: string | null = null;
  for (const child of params.node.children) {
    throwIfAborted(params.signal);
    await buildNodeTree({
      bridge: params.bridge,
      node: child,
      parentId: created.id,
      afterId: lastChildId,
      createdNodeIds: params.createdNodeIds,
      nodeIdMap: params.nodeIdMap,
      signal: params.signal
    });
    lastChildId = params.nodeIdMap.get(child.id) ?? null;
  }
}

async function applyTextContentTree(params: {
  bridge: WebflowDesignerBridge;
  node: BuildNode;
  nodeIdMap: Map<string, string>;
  signal?: AbortSignal | null;
}): Promise<void> {
  throwIfAborted(params.signal);
  const runtimeNodeId = params.nodeIdMap.get(params.node.id);
  if (
    runtimeNodeId &&
    typeof params.node.textContent === "string" &&
    params.node.textContent.trim().length > 0
  ) {
    await params.bridge.setNodeTextContent(runtimeNodeId, params.node.textContent);
  }

  for (const child of params.node.children) {
    await applyTextContentTree({
      bridge: params.bridge,
      node: child,
      nodeIdMap: params.nodeIdMap,
      signal: params.signal
    });
  }
}

async function applyAssetBindings(params: {
  bridge: WebflowDesignerBridge;
  assetBindings: SkeletonPlan["assetBindings"] | BuildPlan["assetBindings"];
  nodeIdMap: Map<string, string>;
  missingAssets: string[];
  signal?: AbortSignal | null;
}): Promise<void> {
  for (const assetBinding of params.assetBindings) {
    throwIfAborted(params.signal);
    const runtimeNodeId = params.nodeIdMap.get(assetBinding.nodeId);
    if (!runtimeNodeId) continue;
    const result = await params.bridge.bindAsset(
      runtimeNodeId,
      assetBinding.source,
      assetBinding.fallback
    );
    if (!result.resolved) {
      params.missingAssets.push(assetBinding.source);
    }
  }
}

export async function executeSkeletonPlanIntoRoot(params: {
  bridge: WebflowDesignerBridge;
  rootNodeId: string;
  plan: SkeletonPlan;
  signal?: AbortSignal | null;
}): Promise<ExecutionSummary> {
  const createdNodeIds: string[] = [];
  const nodeIdMap = new Map<string, string>();
  let lastChildId: string | null = null;

  try {
    throwIfAborted(params.signal);
    await params.bridge.configureNode(params.rootNodeId, {
      tag: params.plan.elementTree.tag,
      classNames: params.plan.elementTree.classNames,
      textContent: params.plan.elementTree.textContent
    });

    for (const child of params.plan.elementTree.children) {
      throwIfAborted(params.signal);
      await buildNodeTree({
        bridge: params.bridge,
        node: child,
        parentId: params.rootNodeId,
        afterId: lastChildId,
        createdNodeIds,
        nodeIdMap,
        signal: params.signal
      });
      lastChildId = nodeIdMap.get(child.id) ?? null;
    }

    const missingAssets: string[] = [];
    await applyAssetBindings({
      bridge: params.bridge,
      assetBindings: params.plan.assetBindings,
      nodeIdMap,
      missingAssets,
      signal: params.signal
    });

    return {
      success: true,
      createdNodeIds,
      createdStyleIds: [],
      reusedClasses: params.plan.reusableClasses,
      createdClasses: [],
      warnings: params.plan.warnings,
      missingAssets,
      rollbackOutcome: null,
      rootNodeId: params.rootNodeId
    };
  } catch (error) {
    let rollbackOutcome: ExecutionSummary["rollbackOutcome"] = null;
    try {
      if (createdNodeIds.length > 0) {
        await params.bridge.deleteNodes([...createdNodeIds].reverse());
      }
      rollbackOutcome = {
        attempted: true,
        successful: true,
        details: "Created component nodes were removed after failure."
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
      createdStyleIds: [],
      reusedClasses: [],
      createdClasses: [],
      warnings: [
        ...params.plan.warnings,
        {
          code: "component-seed-failure",
          message:
            error instanceof Error ? error.message : "Failed to seed the component.",
          level: "error"
        }
      ],
      missingAssets: [],
      rollbackOutcome,
      rootNodeId: params.rootNodeId
    };
  }
}

export async function executeBuildPlan(params: {
  bridge: WebflowDesignerBridge;
  context: DesignerContext;
  plan: BuildPlan;
  placementMode: PlacementMode;
  placementTarget: string | null;
  signal?: AbortSignal | null;
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
    throwIfAborted(params.signal);
    await buildNodeTree({
      bridge: params.bridge,
      node: params.plan.elementTree,
      parentId: params.context.pageId,
      afterId: anchorId,
      createdNodeIds,
      nodeIdMap,
      signal: params.signal
    });

    await applyTextContentTree({
      bridge: params.bridge,
      node: params.plan.elementTree,
      nodeIdMap,
      signal: params.signal
    });

    for (const styleDefinition of params.plan.styleDefinitions) {
      throwIfAborted(params.signal);
      const style = await params.bridge.ensureStyle(
        styleDefinition.className,
        styleDefinition.properties
      );
      createdStyleIds.push(style.styleId);
    }

    for (const binding of params.plan.variableBindings) {
      throwIfAborted(params.signal);
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

    await applyAssetBindings({
      bridge: params.bridge,
      assetBindings: params.plan.assetBindings,
      nodeIdMap,
      missingAssets,
      signal: params.signal
    });

    return {
      success: true,
      createdNodeIds,
      createdStyleIds,
      reusedClasses: params.plan.classAssignments.flatMap((item) => item.reused),
      createdClasses: params.plan.styleDefinitions.map((item) => item.className),
      warnings: [...params.plan.warnings, ...executionWarnings],
      missingAssets,
      rollbackOutcome: null,
      rootNodeId: createdNodeIds[0] ?? null
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
      rollbackOutcome,
      rootNodeId: createdNodeIds[0] ?? null
    };
  }
}

export async function executeSkeletonPlan(params: {
  bridge: WebflowDesignerBridge;
  context: DesignerContext;
  plan: SkeletonPlan;
  placementMode: PlacementMode;
  placementTarget: string | null;
  signal?: AbortSignal | null;
}): Promise<ExecutionSummary> {
  const collectAssignments = (node: BuildNode): Array<{
    nodeId: string;
    classNames: string[];
    reused: string[];
    created: string[];
  }> => [
    {
      nodeId: node.id,
      classNames: node.classNames,
      reused: node.classNames,
      created: []
    },
    ...node.children.flatMap(collectAssignments)
  ];

  return executeBuildPlan({
    bridge: params.bridge,
    context: params.context,
    placementMode: params.placementMode,
    placementTarget: params.placementTarget,
    signal: params.signal,
    plan: {
      sectionMetadata: params.plan.sectionMetadata,
      elementTree: params.plan.elementTree,
      classAssignments: collectAssignments(params.plan.elementTree),
      styleDefinitions: [],
      variableBindings: [],
      assetBindings: params.plan.assetBindings,
      warnings: params.plan.warnings
    }
  });
}

export async function applyStylingPlan(params: {
  bridge: WebflowDesignerBridge;
  context: DesignerContext;
  plan: StylingPlan;
  targetNodeId: string | null;
  signal?: AbortSignal | null;
}): Promise<ExecutionSummary> {
  if (!params.context.siteId || !params.context.pageId) {
    throw new Error("No active Webflow site or page.");
  }
  if (!["design", "build", "edit"].includes(params.context.mode)) {
    throw new Error("Webflow Designer is not in editable mode.");
  }
  if (!params.targetNodeId) {
    throw new Error("Styling requires a selected section root or inserted skeleton root.");
  }

  const createdStyleIds: string[] = [];
  const warnings: PlannerWarning[] = [...params.plan.warnings];

  try {
    for (const styleDefinition of params.plan.styleDefinitions) {
      throwIfAborted(params.signal);
      const style = await params.bridge.ensureStyle(
        styleDefinition.className,
        styleDefinition.properties
      );
      createdStyleIds.push(style.styleId);
    }

    if (params.plan.requiredClassNames.length > 0) {
      throwIfAborted(params.signal);
      await params.bridge.applyClasses(
        params.targetNodeId,
        params.plan.requiredClassNames
      );
    }

    for (const binding of params.plan.variableBindings) {
      throwIfAborted(params.signal);
      try {
        await params.bridge.bindVariable(
          params.targetNodeId,
          binding.property,
          binding.variableName
        );
      } catch (error) {
        warnings.push({
          code: "variable-binding-skipped",
          message:
            error instanceof Error
              ? error.message
              : `Variable binding failed for ${binding.variableName}.`,
          level: "warning"
        });
      }
    }

    return {
      success: true,
      createdNodeIds: [],
      createdStyleIds,
      reusedClasses: params.plan.reusableClasses,
      createdClasses: params.plan.styleDefinitions.map((item) => item.className),
      warnings,
      missingAssets: [],
      rollbackOutcome: null,
      rootNodeId: params.targetNodeId
    };
  } catch (error) {
    let rollbackOutcome: ExecutionSummary["rollbackOutcome"] = null;
    try {
      await params.bridge.deleteStyles(createdStyleIds);
      rollbackOutcome = {
        attempted: true,
        successful: true,
        details: "Created styles were removed after failure."
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
      createdNodeIds: [],
      createdStyleIds,
      reusedClasses: [],
      createdClasses: params.plan.styleDefinitions.map((item) => item.className),
      warnings: [
        ...warnings,
        {
          code: "styling-failure",
          message:
            error instanceof Error ? error.message : "Styling execution failed.",
          level: "error"
        }
      ],
      missingAssets: [],
      rollbackOutcome,
      rootNodeId: params.targetNodeId
    };
  }
}
