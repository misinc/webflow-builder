import type { ExecutionSummary } from "../../executor/buildExecutor.js";
import type { WebflowDesignerBridge } from "../../webflow/bridge.js";

function dedupe(values: string[]) {
  return [...new Set(values)];
}

export function mergeExecutionSummaries(
  summaries: Array<ExecutionSummary | null | undefined>
): ExecutionSummary | null {
  const parts = summaries.filter(
    (summary): summary is ExecutionSummary => Boolean(summary)
  );
  if (parts.length === 0) {
    return null;
  }

  return {
    success: parts.every((summary) => summary.success),
    createdNodeIds: dedupe(parts.flatMap((summary) => summary.createdNodeIds)),
    createdStyleIds: dedupe(parts.flatMap((summary) => summary.createdStyleIds)),
    reusedClasses: dedupe(parts.flatMap((summary) => summary.reusedClasses)),
    createdClasses: dedupe(parts.flatMap((summary) => summary.createdClasses)),
    warnings: parts.flatMap((summary) => summary.warnings),
    missingAssets: dedupe(parts.flatMap((summary) => summary.missingAssets)),
    rollbackOutcome:
      [...parts]
        .reverse()
        .find((summary) => summary.rollbackOutcome !== null)?.rollbackOutcome ?? null,
    rootNodeId:
      [...parts]
        .reverse()
        .find((summary) => summary.rootNodeId)?.rootNodeId ?? null
  };
}

export async function rollbackExecutionSummary(
  bridge: WebflowDesignerBridge,
  summary: ExecutionSummary | null | undefined
): Promise<void> {
  if (!summary) {
    return;
  }

  const createdNodeIds = dedupe(summary.createdNodeIds);
  const createdStyleIds = dedupe(summary.createdStyleIds);

  if (createdNodeIds.length > 0) {
    await bridge.deleteNodes([...createdNodeIds].reverse());
  }
  if (createdStyleIds.length > 0) {
    await bridge.deleteStyles(createdStyleIds);
  }
}
