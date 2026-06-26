import {
  SharedStyleContext,
  siteStylePlanRequestSchema,
  SiteStylePlan,
  SiteStylePlanClassDecision,
  SiteStylePlanRequest,
  siteStylePlanSchema
} from "@wfb/shared/contracts.js";
import { AppRepository } from "../repositories/app-repository.js";
import { nowIso, stableId } from "../utils.js";

function classTokensFromSource(source: string): string[] {
  const tokens = new Set<string>();
  const patterns = [
    /\bclassName\s*=\s*["']([^"']+)["']/g,
    /\bclass\s*=\s*["']([^"']+)["']/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      for (const token of (match[1] ?? "").split(/\s+/)) {
        const normalized = token.trim();
        if (normalized && !/[{}[\]()`$]/.test(normalized)) {
          tokens.add(normalized);
        }
      }
    }
  }
  return [...tokens].sort();
}

function emptySharedStyleContext(siteId: string): SharedStyleContext {
  return {
    siteId,
    capturedAt: new Date().toISOString(),
    classes: [],
    variables: [],
    styleIds: []
  };
}

export class SiteStylePlanService {
  constructor(private readonly repository: AppRepository) {}

  async getOrCreatePlan(input: SiteStylePlanRequest): Promise<SiteStylePlan> {
    const request = siteStylePlanRequestSchema.parse(input);
    const existing = await this.repository.getSiteStylePlan(
      request.repoId,
      request.webflowSiteId
    );
    if (existing) {
      return existing;
    }
    return this.rebuildPlan(request);
  }

  async rebuildPlan(input: SiteStylePlanRequest): Promise<SiteStylePlan> {
    const request = siteStylePlanRequestSchema.parse(input);
    if (request.sharedStyleContext) {
      await this.repository.saveSharedStyleContext(
        request.webflowSiteId,
        request.sharedStyleContext
      );
    }
    const sharedStyleContext =
      request.sharedStyleContext ??
      (await this.repository.getSharedStyleContext(request.webflowSiteId)) ??
      emptySharedStyleContext(request.webflowSiteId);

    const sections = await this.repository.getSections(request.repoId);
    const repoClassNames = new Set<string>();
    for (const section of sections) {
      const source =
        typeof section.metadata.inlineSourceCode === "string"
          ? section.metadata.inlineSourceCode
          : "";
      classTokensFromSource(source).forEach((className) => repoClassNames.add(className));
    }

    const webflowClassNames = new Set(
      sharedStyleContext.classes.map((classRecord) => classRecord.name)
    );
    const classDecisions: SiteStylePlanClassDecision[] = [...repoClassNames].sort().map((className) => {
      const shouldReuse = webflowClassNames.has(className);
      return {
        sourceClassName: className,
        action: shouldReuse ? "reuse" as const : "create" as const,
        targetClassName: className,
        source: "repo" as const
      };
    });

    for (const className of [...webflowClassNames].sort()) {
      if (!repoClassNames.has(className)) {
        classDecisions.push({
          sourceClassName: className,
          action: "reuse",
          targetClassName: className,
          source: "webflow"
        });
      }
    }

    const timestamp = nowIso();
    const plan = siteStylePlanSchema.parse({
      id: stableId("site-style-plan", request.repoId, request.webflowSiteId),
      repoId: request.repoId,
      webflowSiteId: request.webflowSiteId,
      status: "draft",
      classDecisions,
      variableNames: sharedStyleContext.variables.map((variable) => variable.name).sort(),
      classCounts: {
        repo: repoClassNames.size,
        webflow: webflowClassNames.size,
        reuse: classDecisions.filter((decision) => decision.action === "reuse").length,
        create: classDecisions.filter((decision) => decision.action === "create").length
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      confirmedAt: null
    });
    await this.repository.saveSiteStylePlan(plan);
    return plan;
  }

  async confirmPlan(input: SiteStylePlanRequest): Promise<SiteStylePlan> {
    const current = await this.getOrCreatePlan(input);
    const timestamp = nowIso();
    const confirmed = siteStylePlanSchema.parse({
      ...current,
      status: "confirmed",
      updatedAt: timestamp,
      confirmedAt: timestamp
    });
    await this.repository.saveSiteStylePlan(confirmed);
    return confirmed;
  }
}
