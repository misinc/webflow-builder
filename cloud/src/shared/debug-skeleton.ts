export interface DebugSkeletonRoutingDecision {
  useBackground: boolean;
  score: number;
  reasons: string[];
}

export function decideDebugSkeletonRouting(input: {
  code: string;
  inputType: "html" | "jsx";
}): DebugSkeletonRoutingDecision {
  const code = input.code ?? "";
  const tagCount = (code.match(/<[a-z][^>]*>/gi) ?? []).length;
  const paragraphLikeCount = (code.match(/<(p|li|h[1-6]|img|ul|ol)\b/gi) ?? []).length;
  const listItemCount = (code.match(/<li\b/gi) ?? []).length;
  const repeatedWrapperCount = (code.match(/<div\b/gi) ?? []).length;

  let score = 0;
  const reasons: string[] = [];

  if (code.length > 12000) {
    score += 2;
    reasons.push("source length > 12000");
  } else if (code.length > 7000) {
    score += 1;
    reasons.push("source length > 7000");
  }

  if (tagCount > 120) {
    score += 2;
    reasons.push("tag count > 120");
  } else if (tagCount > 60) {
    score += 1;
    reasons.push("tag count > 60");
  }

  if (paragraphLikeCount > 30) {
    score += 1;
    reasons.push("many text/list/media nodes");
  }

  if (listItemCount > 10) {
    score += 1;
    reasons.push("list items > 10");
  }

  if (input.inputType === "html" && repeatedWrapperCount > 40) {
    score += 1;
    reasons.push("many nested wrappers");
  }

  return {
    useBackground: score >= 2,
    score,
    reasons
  };
}
