import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const legacyDuplicateTrees = [
  "cloud/src/backend",
  "cloud/src/shared",
  "src/backend",
  "src/shared"
];

describe("single source backend/shared guard", () => {
  it("keeps backend and shared code in workspace packages only", () => {
    for (const path of legacyDuplicateTrees) {
      expect(existsSync(path), `${path} should not be recreated`).toBe(false);
    }
  });
});
