// D1 limits the number of bound parameters in a prepared statement. Keep a
// small margin below that limit so multi-row inserts remain portable across
// local and remote D1 runtimes.
export const D1_SAFE_BOUND_PARAMETER_LIMIT = 90;

export function insertBatchSize(columnCount: number): number {
  return Math.max(1, Math.floor(D1_SAFE_BOUND_PARAMETER_LIMIT / columnCount));
}

export function assertD1BatchWithinLimit(
  label: string,
  rowCount: number,
  columnCount: number
): void {
  const boundParameterCount = rowCount * columnCount;
  if (boundParameterCount > D1_SAFE_BOUND_PARAMETER_LIMIT) {
    throw new Error(
      `${label} would bind ${boundParameterCount} parameters, exceeding the D1 safe limit of ${D1_SAFE_BOUND_PARAMETER_LIMIT}.`
    );
  }
}
