import {
  BuildNode,
  BuildPlan,
  PlannerWarning,
  ProjectContext,
  SectionContext,
  SharedStyleContext
} from "@wfb/shared/contracts.js";
import { dedupe } from "@wfb/shared/client-first.js";
import { slugify } from "@wfb/shared/text.js";

function sharedOrFallback(
  sharedStyleContext: SharedStyleContext,
  category: string,
  preferred: string[],
  fallback: string
): string {
  const candidates = sharedStyleContext.classes.filter(
    (item) => item.category === category
  );
  const normalizedPreferred = preferred.map((value) => value.toLowerCase());

  const exactMatch = candidates.find((item) =>
    normalizedPreferred.includes(item.name.toLowerCase())
  );
  if (exactMatch) {
    return exactMatch.name;
  }

  const prefixMatch = candidates.find((item) =>
    normalizedPreferred.some((value) => item.name.toLowerCase().startsWith(value))
  );
  if (prefixMatch) {
    return prefixMatch.name;
  }

  const containsMatch = candidates.find((item) =>
    normalizedPreferred.some((value) => item.name.toLowerCase().includes(value))
  );
  return containsMatch?.name ?? fallback;
}

function buildNode(
  id: string,
  type: string,
  tag: string,
  classNames: string[],
  children: BuildNode[],
  textContent?: string,
  label?: string
): BuildNode {
  return {
    id,
    type,
    tag,
    label,
    classNames: dedupe(classNames),
    textContent,
    children
  };
}

function createBaseTree(
  sectionKey: string,
  sharedStyleContext: SharedStyleContext
): {
  root: BuildNode;
  componentNode: BuildNode;
  contentNode: BuildNode;
  visualNode: BuildNode;
} {
  const root = buildNode(
    `${sectionKey}-root`,
    "section",
    "section",
    ["section", `section_${sectionKey}`],
    []
  );
  const padding = buildNode(
    `${sectionKey}-padding`,
    "container",
    "div",
    [sharedOrFallback(sharedStyleContext, "layout", ["padding-global"], "padding-global")],
    []
  );
  const container = buildNode(
    `${sectionKey}-container`,
    "container",
    "div",
    [
      sharedOrFallback(
        sharedStyleContext,
        "layout",
        ["container-large", "container"],
        "container-large"
      )
    ],
    []
  );
  const sectionPadding = buildNode(
    `${sectionKey}-section-padding`,
    "container",
    "div",
    [
      sharedOrFallback(
        sharedStyleContext,
        "spacing",
        ["padding-section-medium", "padding-section", "section-padding"],
        "padding-section-medium"
      )
    ],
    []
  );
  const componentNode = buildNode(
    `${sectionKey}-component`,
    "group",
    "div",
    [`${sectionKey}_component`],
    []
  );
  const contentNode = buildNode(
    `${sectionKey}-content`,
    "group",
    "div",
    [`${sectionKey}_content`],
    []
  );
  const visualNode = buildNode(
    `${sectionKey}-visual`,
    "group",
    "div",
    [`${sectionKey}_visual`],
    []
  );

  componentNode.children.push(contentNode, visualNode);
  sectionPadding.children.push(componentNode);
  container.children.push(sectionPadding);
  padding.children.push(container);
  root.children.push(padding);

  return { root, componentNode, contentNode, visualNode };
}

function chooseCopy(
  sectionContext: SectionContext,
  fallback: { eyebrow: string; title: string; body: string }
): { eyebrow: string; title: string; body: string } {
  const [firstHint, secondHint, thirdHint] = sectionContext.contentHints;
  return {
    eyebrow: firstHint ?? fallback.eyebrow,
    title: secondHint ?? fallback.title,
    body: thirdHint ?? fallback.body
  };
}

function heroPlan(
  sectionContext: SectionContext,
  sharedStyleContext: SharedStyleContext
): BuildNode {
  const tree = createBaseTree("hero", sharedStyleContext);
  const copy = chooseCopy(sectionContext, {
    eyebrow: "Strategic digital studio",
    title: "Build a native Webflow hero from repo source",
    body: "This section reuses shared typography, buttons, and spacing from the active Client-First site."
  });

  tree.contentNode.children.push(
    buildNode(
      "hero-eyebrow",
      "text",
      "p",
      [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-small", "is-text-small", "eyebrow", "text-small"],
          "text-size-small"
        )
      ],
      [],
      copy.eyebrow
    ),
    buildNode(
      "hero-heading",
      "heading",
      "h1",
      [sharedOrFallback(sharedStyleContext, "heading", ["h1", "display"], "heading-style-h1")],
      [],
      copy.title
    ),
    buildNode(
      "hero-body",
      "text",
      "p",
      [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-medium", "body", "text-medium"],
          "text-size-medium"
        )
      ],
      [],
      copy.body
    ),
    buildNode("hero-actions", "group", "div", ["hero_actions"], [
      buildNode(
        "hero-button-primary",
        "button",
        "button",
        [sharedOrFallback(sharedStyleContext, "button", ["button-primary"], "button")],
        [],
        "Build section"
      ),
      buildNode(
        "hero-button-secondary",
        "button",
        "button",
        [sharedOrFallback(sharedStyleContext, "button", ["button-secondary"], "button-secondary")],
        [],
        "Review output"
      )
    ])
  );

  tree.visualNode.children.push(
    buildNode("hero-image", "image", "img", ["hero_media"], [])
  );

  return tree.root;
}

function servicesPlan(
  sectionContext: SectionContext,
  sharedStyleContext: SharedStyleContext
): BuildNode {
  const tree = createBaseTree("services", sharedStyleContext);
  const copy = chooseCopy(sectionContext, {
    eyebrow: "Strategic services",
    title: "Shared building blocks, section by section",
    body: "The planner prefers reusable shared classes before creating new layout-specific styles."
  });

  const listNode = buildNode("services-list", "list", "div", ["services_list"], []);
  ["Planning", "Execution", "Review"].forEach((label, index) => {
    listNode.children.push(
      buildNode(`services-item-${index}`, "listItem", "article", ["services_item"], [
        buildNode(
          `services-item-heading-${index}`,
          "heading",
          "h3",
          [sharedOrFallback(sharedStyleContext, "heading", ["h3", "heading"], "heading-style-h4")],
          [],
          label
        ),
        buildNode(
          `services-item-copy-${index}`,
          "text",
          "p",
          [
            sharedOrFallback(
              sharedStyleContext,
              "text",
              ["text-size-small", "body", "text-small"],
              "text-size-small"
            )
          ],
          [],
          "Mapped into Webflow with Client-First-compatible structure and reuse-first class decisions."
        )
      ])
    );
  });

  tree.contentNode.children.push(
    buildNode(
      "services-heading",
      "heading",
      "h2",
      [sharedOrFallback(sharedStyleContext, "heading", ["h2", "display"], "heading-style-h2")],
      [],
      copy.title
    ),
    buildNode(
      "services-body",
      "text",
      "p",
      [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-medium", "body", "text-medium"],
          "text-size-medium"
        )
      ],
      [],
      copy.body
    )
  );
  tree.visualNode.children.push(listNode);
  return tree.root;
}

function solutionsPlan(
  sectionContext: SectionContext,
  sharedStyleContext: SharedStyleContext
): BuildNode {
  const tree = createBaseTree("solutions", sharedStyleContext);
  const copy = chooseCopy(sectionContext, {
    eyebrow: "Solutions",
    title: "Validate first, mutate second",
    body: "Unsupported patterns become warnings so the build stays explicit and reviewable."
  });

  tree.contentNode.children.push(
    buildNode(
      "solutions-eyebrow",
      "text",
      "p",
      [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-small", "is-text-small", "eyebrow", "text-small"],
          "text-size-small"
        )
      ],
      [],
      copy.eyebrow
    ),
    buildNode(
      "solutions-heading",
      "heading",
      "h2",
      [sharedOrFallback(sharedStyleContext, "heading", ["h2", "display"], "heading-style-h2")],
      [],
      copy.title
    ),
    buildNode(
      "solutions-body",
      "text",
      "p",
      [
        sharedOrFallback(
          sharedStyleContext,
          "text",
          ["text-size-medium", "body", "text-medium"],
          "text-size-medium"
        )
      ],
      [],
      copy.body
    )
  );

  const bulletList = buildNode("solutions-bullets", "list", "ul", ["solutions_list"], []);
  ["Repo extraction", "Plan validation", "Designer execution"].forEach(
    (label, index) => {
      bulletList.children.push(
        buildNode(
          `solutions-bullet-${index}`,
          "listItem",
          "li",
          ["solutions_item"],
          [],
          label
        )
      );
    }
  );

  tree.visualNode.children.push(bulletList);
  return tree.root;
}

function walkTree(node: BuildNode, visit: (node: BuildNode) => void): void {
  visit(node);
  node.children.forEach((child) => walkTree(child, visit));
}

function findFirstNode(
  node: BuildNode,
  predicate: (candidate: BuildNode) => boolean
): BuildNode | null {
  if (predicate(node)) {
    return node;
  }

  for (const child of node.children) {
    const match = findFirstNode(child, predicate);
    if (match) {
      return match;
    }
  }

  return null;
}

function findAllNodeIds(
  node: BuildNode,
  predicate: (candidate: BuildNode) => boolean
): string[] {
  const matches = predicate(node) ? [node.id] : [];
  return [...matches, ...node.children.flatMap((child) => findAllNodeIds(child, predicate))];
}

export class HeuristicBuildPlanner {
  plan(params: {
    pageId: string;
    sectionId: string;
    sectionContext: SectionContext;
    projectContext: ProjectContext;
    sharedStyleContext: SharedStyleContext;
  }): BuildPlan {
    const sectionKey = slugify(params.sectionContext.sectionName);
    const warnings: PlannerWarning[] = [
      {
        code: "heuristic-planner",
        message:
          "Using deterministic heuristic planner. Swap in a remote LLM planner when provider credentials are configured.",
        level: "info"
      }
    ];

    let elementTree: BuildNode;
    if (sectionKey === "hero") {
      elementTree = heroPlan(params.sectionContext, params.sharedStyleContext);
    } else if (sectionKey === "services") {
      elementTree = servicesPlan(params.sectionContext, params.sharedStyleContext);
    } else {
      elementTree = solutionsPlan(params.sectionContext, params.sharedStyleContext);
    }

    const sharedClassSet = new Set(
      params.sharedStyleContext.classes.map((item) => item.name)
    );
    const classAssignments: BuildPlan["classAssignments"] = [];
    const createdClasses = new Set<string>();
    walkTree(elementTree, (node) => {
      const reused = node.classNames.filter((name) => sharedClassSet.has(name));
      const created = node.classNames.filter((name) => !sharedClassSet.has(name));
      created.forEach((name) => createdClasses.add(name));
      classAssignments.push({
        nodeId: node.id,
        classNames: node.classNames,
        reused,
        created
      });
    });

    const styleDefinitions = [...createdClasses].map((className) => {
      const properties: Record<string, string> = { display: "block" };
      if (className.endsWith("_component")) {
        properties.display = "grid";
        properties.gap = "var(--space-large)";
      } else if (className.endsWith("_actions")) {
        properties.display = "flex";
        properties.gap = "var(--space-small)";
      } else if (className.endsWith("_list")) {
        properties.display = "grid";
        properties.gap = "var(--space-medium)";
      }

      return {
        className,
        properties,
        shared: false
      };
    });

    const spacingVariable = params.sharedStyleContext.variables.find(
      (item) => item.category === "spacing"
    );
    const variableBindings = spacingVariable
      ? [
          {
            nodeId: elementTree.id,
            property: "padding-top",
            variableName: spacingVariable.name
          }
        ]
      : [];

    if (!spacingVariable && params.sharedStyleContext.variables.length > 0) {
      warnings.push({
        code: "missing-spacing-variable",
        message:
          "No spacing variable was available on the active Webflow site, so spacing variable bindings were skipped.",
        level: "warning"
      });
    }

    const imageNodeIds = findAllNodeIds(elementTree, (node) => node.tag === "img");
    const fallbackAssetTargetNode =
      findFirstNode(elementTree, (node) => node.id.endsWith("-visual"))?.id ??
      elementTree.id;
    const assetBindings =
      imageNodeIds.length > 0
        ? params.sectionContext.assetReferences
            .slice(0, imageNodeIds.length)
            .map((source, index) => ({
              nodeId: imageNodeIds[index]!,
              source,
              fallback: "placeholder" as const
            }))
        : params.sectionContext.assetReferences.map((source) => ({
            nodeId: fallbackAssetTargetNode,
            source,
            fallback: "placeholder" as const
          }));

    if (assetBindings.length > 0) {
      warnings.push({
        code: "asset-placeholder",
        message:
          "Some asset references require placeholders unless the matching Webflow assets are already available.",
        level: "warning"
      });
    }

    return {
      sectionMetadata: {
        repoId: params.sectionContext.repoId,
        pageId: params.pageId,
        sectionId: params.sectionId,
        pageName: params.sectionContext.pageName,
        sectionName: params.sectionContext.sectionName,
        sourceFile: params.sectionContext.sectionSourceFile
      },
      elementTree,
      classAssignments,
      styleDefinitions,
      variableBindings,
      assetBindings,
      warnings
    };
  }
}
