import {
  BuildNode,
  BuildPlan,
  PlacementMode,
  PlannerWarning,
  SkeletonPlan,
  StylingPlan
} from "@wfb/shared/contracts.js";
import { isReservedStyleGuideClassName } from "@wfb/shared/client-first.js";
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
  nodeIdMap?: Record<string, string>;
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) {
    return;
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  throw error;
}

function isTransientDesignerError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    error instanceof TypeError ||
    /timeout|timed out|temporar|rate|429|network|busy|unavailable|try again/.test(message)
  );
}

function filterBuilderClassNames(classNames: string[]): string[] {
  return classNames.filter((className) => !isReservedStyleGuideClassName(className));
}

async function retryDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        reject(error);
      },
      { once: true }
    );
  });
}

async function withDesignerRetry<T>(
  label: string,
  signal: AbortSignal | null | undefined,
  operation: () => Promise<T>
): Promise<T> {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientDesignerError(error)) {
        break;
      }
      await retryDelay(100 * 2 ** (attempt - 1), signal);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${maxAttempts} attempts.`);
}

// Derive a human-readable icon name from the source classes (e.g. Lucide's
// "lucide-globe" -> "globe") so the placeholder tells the user which icon to add.
function iconNameFromClasses(sourceClassNames?: string[]): string {
  const classes = sourceClassNames ?? [];
  for (const className of classes) {
    const match = /^(?:lucide|icon|feather|fa|bi|mdi|hero|tabler|ph)-(.+)$/i.exec(className);
    if (match) {
      return match[1];
    }
  }
  const specific = classes.find(
    (className) => className.includes("-") && !/^(icon|svg|embed)$/i.test(className)
  );
  return specific ?? classes[0] ?? "icon";
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
  const classNames = filterBuilderClassNames(params.node.classNames);
  if (classNames.length > 0) {
    await withDesignerRetry("applyClasses", params.signal, () =>
      params.bridge.applyClasses(created.id, classNames)
    );
  }
  const setNodeAttribute = params.bridge.setNodeAttribute?.bind(params.bridge);
  if (params.node.type === "embed" && setNodeAttribute) {
    // Icon embeds render as an Image element (see bridge.getInsertionSpec). Tag it
    // with the source icon name so the user knows which asset to drop in.
    throwIfAborted(params.signal);
    await withDesignerRetry("setNodeAttribute", params.signal, () =>
      setNodeAttribute(created.id, "data-icon", iconNameFromClasses(params.node.sourceClassNames))
    );
  }
  if (typeof params.node.textContent === "string" && params.node.textContent.trim().length > 0) {
    throwIfAborted(params.signal);
    await withDesignerRetry("setNodeTextContent", params.signal, () =>
      params.bridge.setNodeTextContent(created.id, params.node.textContent!)
    );
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
    await withDesignerRetry("setNodeTextContent", params.signal, () =>
      params.bridge.setNodeTextContent(runtimeNodeId, params.node.textContent!)
    );
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
      classNames: filterBuilderClassNames(params.plan.elementTree.classNames),
      textContent: params.plan.elementTree.textContent
    });
    nodeIdMap.set(params.plan.elementTree.id, params.rootNodeId);

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
      reusedClasses: filterBuilderClassNames(params.plan.reusableClasses),
      createdClasses: [],
      warnings: params.plan.warnings,
      missingAssets,
      rollbackOutcome: null,
      rootNodeId: params.rootNodeId,
      nodeIdMap: Object.fromEntries(nodeIdMap)
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
      rootNodeId: params.rootNodeId,
      nodeIdMap: Object.fromEntries(nodeIdMap)
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
    // Create classes WITH their properties BEFORE applying them to elements —
    // Webflow drops a brand-new class that has no properties yet.
    for (const styleDefinition of params.plan.styleDefinitions) {
      throwIfAborted(params.signal);
      if (isReservedStyleGuideClassName(styleDefinition.className)) {
        executionWarnings.push({
          code: "reserved-styleguide-class-skipped",
          message: `Skipped reserved style guide class ${styleDefinition.className}.`,
          level: "warning"
        });
        continue;
      }
      const style = await withDesignerRetry("ensureStyle", params.signal, () =>
        params.bridge.ensureStyle(styleDefinition.className, styleDefinition.properties)
      );
      createdStyleIds.push(style.styleId);
    }

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

    for (const binding of params.plan.variableBindings) {
      throwIfAborted(params.signal);
      const runtimeNodeId = nodeIdMap.get(binding.nodeId);
      if (!runtimeNodeId) continue;
      try {
        await withDesignerRetry("bindVariable", params.signal, () =>
          params.bridge.bindVariable(
            runtimeNodeId,
            binding.property,
            binding.variableName,
            binding.value
          )
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
      reusedClasses: params.plan.classAssignments
        .flatMap((item) => item.reused)
        .filter((className) => !isReservedStyleGuideClassName(className)),
      createdClasses: params.plan.styleDefinitions
        .map((item) => item.className)
        .filter((className) => !isReservedStyleGuideClassName(className)),
      warnings: [...params.plan.warnings, ...executionWarnings],
      missingAssets,
      rollbackOutcome: null,
      rootNodeId: createdNodeIds[0] ?? null,
      nodeIdMap: Object.fromEntries(nodeIdMap)
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
      createdClasses: params.plan.styleDefinitions
        .map((item) => item.className)
        .filter((className) => !isReservedStyleGuideClassName(className)),
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
      rootNodeId: createdNodeIds[0] ?? null,
      nodeIdMap: Object.fromEntries(nodeIdMap)
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
      reused: filterBuilderClassNames(node.classNames),
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
      styleDefinitions: params.plan.styleDefinitions ?? [],
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
  const targetNodeId = params.targetNodeId;

  try {
    for (const styleDefinition of params.plan.styleDefinitions) {
      throwIfAborted(params.signal);
      if (isReservedStyleGuideClassName(styleDefinition.className)) {
        warnings.push({
          code: "reserved-styleguide-class-skipped",
          message: `Skipped reserved style guide class ${styleDefinition.className}.`,
          level: "warning"
        });
        continue;
      }
      const style = await withDesignerRetry("ensureStyle", params.signal, () =>
        params.bridge.ensureStyle(
          styleDefinition.className,
          styleDefinition.properties
        )
      );
      createdStyleIds.push(style.styleId);
    }

    const requiredClassNames = filterBuilderClassNames(params.plan.requiredClassNames);
    if (requiredClassNames.length > 0) {
      throwIfAborted(params.signal);
      await withDesignerRetry("applyClasses", params.signal, () =>
        params.bridge.applyClasses(
          targetNodeId,
          requiredClassNames
        )
      );
    }

    for (const binding of params.plan.variableBindings) {
      throwIfAborted(params.signal);
      try {
        await withDesignerRetry("bindVariable", params.signal, () =>
          params.bridge.bindVariable(
            targetNodeId,
            binding.property,
            binding.variableName,
            binding.value
          )
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
      reusedClasses: filterBuilderClassNames(params.plan.reusableClasses),
      createdClasses: params.plan.styleDefinitions
        .map((item) => item.className)
        .filter((className) => !isReservedStyleGuideClassName(className)),
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
      createdClasses: params.plan.styleDefinitions
        .map((item) => item.className)
        .filter((className) => !isReservedStyleGuideClassName(className)),
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
