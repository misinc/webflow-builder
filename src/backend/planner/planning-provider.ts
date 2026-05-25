import {
  PlannerWarning,
  ProjectContext,
  SectionAnalysis,
  SectionContext,
  SectionMetadata,
  SectionVerification,
  SharedStyleContext,
  SkeletonPlan,
  StylingPlan,
  WorkflowMode
} from "../../shared/contracts.js";
import { SerializedSectionContext } from "./section-serializer.js";

export interface PlanningProviderInput {
  metadata: SectionMetadata;
  mode: WorkflowMode;
  sectionContext: SectionContext;
  serializedSection: SerializedSectionContext;
  projectContext: ProjectContext;
  sharedStyleContext: SharedStyleContext;
  includeContent?: boolean;
  selectedElementId?: string | null;
}

export interface PlanningProvider {
  analyzeSection(input: PlanningProviderInput): Promise<SectionAnalysis>;
  generateSkeleton(input: PlanningProviderInput): Promise<SkeletonPlan>;
  generateStylingPlan(input: PlanningProviderInput): Promise<StylingPlan>;
  verifySection(input: PlanningProviderInput): Promise<SectionVerification>;
}

export function providerWarning(
  code: string,
  message: string,
  level: PlannerWarning["level"] = "warning"
): PlannerWarning {
  return { code, message, level };
}
