import { describe, expect, it } from "vitest";
import { HtmlRepoExtractor } from "@wfb/backend-core/extractor/html-extractor.js";
import type { RepositorySnapshot } from "@wfb/backend-core/github/client.js";

function snapshotWith(html: string): RepositorySnapshot {
  return {
    owner: "acme",
    name: "site",
    defaultBranch: "main",
    commitSha: "fixture",
    files: [{ path: "site/contact.html", content: html }]
  };
}

describe("HtmlRepoExtractor section slicing", () => {
  it("keeps the <section> root when a page has one section under <main>", () => {
    // Contact-page shape: main → single section (with its own padding classes)
    // → container div → content div. The stored section must be the <section>
    // itself — slicing at the inner content div discards the section padding
    // and the flex/gap wrapper.
    const index = new HtmlRepoExtractor().extractRepoIndex(
      "repo-1",
      snapshotWith(`<!doctype html><html><body>
        <main class="flex-1">
          <section class="w-full pt-16 pb-20">
            <div class="mx-auto max-w-6xl px-5">
              <div class="mx-auto flex max-w-4xl flex-col gap-6 text-center">
                <p class="text-xs uppercase">Contact</p>
                <h1>Get in Touch</h1>
                <p>Pick a path.</p>
              </div>
            </div>
          </section>
        </main>
      </body></html>`)
    );

    expect(index.sections).toHaveLength(1);
    const source = index.sections[0].sourceCode;
    expect(source.trimStart().startsWith("<section")).toBe(true);
    expect(source).toContain("pt-16 pb-20");
    expect(source).toContain("gap-6");
  });

  it("still slices multi-section pages into their sections", () => {
    const index = new HtmlRepoExtractor().extractRepoIndex(
      "repo-1",
      snapshotWith(`<!doctype html><html><body>
        <main>
          <section id="hero"><h1>Hero</h1></section>
          <section id="services"><h2>Services</h2></section>
        </main>
      </body></html>`)
    );
    expect(index.sections).toHaveLength(2);
    expect(index.sections[0].sourceCode).toContain("Hero");
    expect(index.sections[1].sourceCode).toContain("Services");
  });
});
