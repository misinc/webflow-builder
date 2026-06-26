import { describe, expect, it } from "vitest";
import {
  assertD1BatchWithinLimit,
  D1_SAFE_BOUND_PARAMETER_LIMIT,
  insertBatchSize
} from "../cloud/src/lib/d1-limits.js";

describe("D1 insert batch limits", () => {
  it("keeps repo page and section insert batches below the safe parameter limit", () => {
    const pageColumns = 7;
    const sectionColumns = 10;
    const pageBatchSize = insertBatchSize(pageColumns);
    const sectionBatchSize = insertBatchSize(sectionColumns);

    expect(pageBatchSize * pageColumns).toBeLessThanOrEqual(
      D1_SAFE_BOUND_PARAMETER_LIMIT
    );
    expect(sectionBatchSize * sectionColumns).toBeLessThanOrEqual(
      D1_SAFE_BOUND_PARAMETER_LIMIT
    );
  });

  it("fails fast if a future multi-row insert would exceed the D1 safe limit", () => {
    expect(() => assertD1BatchWithinLimit("bad insert", 13, 7)).toThrow(
      /exceeding the D1 safe limit/
    );
    expect(() => assertD1BatchWithinLimit("safe insert", 12, 7)).not.toThrow();
  });
});
