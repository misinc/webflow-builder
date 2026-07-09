import { describe, expect, it } from "vitest";
import { MemoryBlobStore } from "@wfb/backend-core/blob/blob-store.js";
import { isRelevantRepoFile, RepositorySnapshot } from "@wfb/backend-core/github/client.js";
import { RepoTokenService } from "@wfb/backend-core/services/repo-token-service.js";

function snapshot(files: RepositorySnapshot["files"]): RepositorySnapshot {
  return {
    owner: "acme",
    name: "site",
    defaultBranch: "main",
    commitSha: "sha",
    files
  };
}

async function serviceWith(files: RepositorySnapshot["files"]) {
  const blobs = new MemoryBlobStore();
  await blobs.putJson("repos/repo-1/snapshots/latest.json", snapshot(files));
  return new RepoTokenService(blobs);
}

describe("RepoTokenService", () => {
  it("discovers direct *.tokens.json children of tokens and variables folders", async () => {
    const service = await serviceWith([
      {
        path: "tokens/colors.tokens.json",
        content: JSON.stringify({
          green: {
            primary: {
              $type: "color",
              $value: { hex: "#8EC441", alpha: 1 }
            }
          }
        })
      },
      {
        path: "src/design/variables/typography.tokens.json",
        content: JSON.stringify({
          body: {
            family: {
              $type: "fontFamily",
              $value: "Inter"
            }
          }
        })
      },
      {
        path: "tokens/nested/colors.tokens.json",
        content: JSON.stringify({
          ignored: {
            $type: "color",
            $value: { hex: "#000000", alpha: 1 }
          }
        })
      }
    ]);

    const response = await service.discoverRepoTokens("repo-1");

    expect(response.tokens.map((token) => `${token.group}:${token.name}`)).toEqual([
      "Typography:body/family",
      "Colors:green/primary"
    ]);
  });

  it("normalizes Figma color alpha and skips duplicate group/name tokens", async () => {
    const service = await serviceWith([
      {
        path: "tokens/colors.tokens.json",
        content: JSON.stringify({
          overlay: {
            "black-10": {
              $type: "color",
              $value: {
                colorSpace: "srgb",
                components: [0, 0, 0],
                alpha: 0.1,
                hex: "#000000"
              }
            }
          }
        })
      },
      {
        path: "variables/colors.tokens.json",
        content: JSON.stringify({
          overlay: {
            "black-10": {
              $type: "color",
              $value: { hex: "#111111", alpha: 1 }
            }
          }
        })
      }
    ]);

    const response = await service.discoverRepoTokens("repo-1");

    expect(response.tokens).toHaveLength(1);
    expect(response.tokens[0]).toMatchObject({
      group: "Colors",
      name: "overlay/black-10",
      value: "rgba(0, 0, 0, 0.1)"
    });
    expect(response.warnings.join("\n")).toContain("Skipped duplicate token Colors/overlay/black-10");
  });

  it("keeps token files in GitHub snapshot filtering", () => {
    expect(isRelevantRepoFile("tokens/colors.tokens.json")).toBe(true);
    expect(isRelevantRepoFile("src/design/variables/typography.tokens.json")).toBe(true);
  });
});
