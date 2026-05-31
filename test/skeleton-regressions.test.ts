import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  normalizeSkeletonPlan,
  parseSkeletonTreeText
} from "../extension/src/skeleton/tree.js";
import { BuildNode, SkeletonPlan } from "../src/shared/contracts.js";

interface RegressionFixture {
  name: string;
  sectionName: string;
  treeText: string;
  assertions: {
    rootTag?: string;
    firstChildClass?: string;
    forbidTags?: string[];
    requireNodes?: Array<{
      tag: string;
      className?: string;
    }>;
  };
}

function basePlan(sectionName: string): SkeletonPlan {
  return {
    sectionMetadata: {
      repoId: "repo-1",
      pageId: "page-1",
      sectionId: `${sectionName.toLowerCase()}-section`,
      pageName: "Debug",
      sectionName,
      sourceFile: `${sectionName}.tsx`
    },
    treeText: "",
    elementTree: {
      id: "root",
      type: "box",
      tag: "section",
      classNames: ["placeholder"],
      children: []
    },
    assetBindings: [],
    reusableClasses: [],
    suggestedNewClasses: [],
    warnings: []
  };
}

function flatten(node: BuildNode): BuildNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

async function loadFixtures(): Promise<RegressionFixture[]> {
  const file = new URL("./fixtures/skeleton-regressions.json", import.meta.url);
  const content = await readFile(file, "utf8");
  return JSON.parse(content) as RegressionFixture[];
}

describe("skeleton regression fixtures", async () => {
  const fixtures = await loadFixtures();

  for (const fixture of fixtures) {
    it(`normalizes ${fixture.name}`, () => {
      const parsed = parseSkeletonTreeText(basePlan(fixture.sectionName), fixture.treeText);
      const normalized = normalizeSkeletonPlan(parsed);
      const nodes = flatten(normalized.elementTree);

      if (fixture.assertions.rootTag) {
        expect(normalized.elementTree.tag).toBe(fixture.assertions.rootTag);
      }

      if (fixture.assertions.firstChildClass) {
        expect(normalized.elementTree.children[0]?.classNames).toContain(
          fixture.assertions.firstChildClass
        );
      }

      for (const forbiddenTag of fixture.assertions.forbidTags ?? []) {
        expect(nodes.some((node) => node.tag === forbiddenTag)).toBe(false);
      }

      for (const required of fixture.assertions.requireNodes ?? []) {
        expect(
          nodes.some(
            (node) =>
              node.tag === required.tag &&
              (!required.className || node.classNames.includes(required.className))
          )
        ).toBe(true);
      }
    });
  }
});
