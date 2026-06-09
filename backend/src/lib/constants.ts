export const SERVICE_NAME = "lazy-protocol-api";
export const LAZY_X_RULE = "Your X post must tag @LazyProtocol.";
export const NO_AI_RULE = "AI-generated submissions are disqualified unless the mission explicitly allows or requests AI use.";
export const MISSION_CATEGORIES = ["World Cup", "Creative", "Predictions", "Research", "Community", "Real World", "Agents", "Sponsored", "Protocol Agent"];

export function ensureRules(rules: string[] = []) {
  const normalized = [...rules];
  if (!normalized.includes(LAZY_X_RULE)) normalized.push(LAZY_X_RULE);
  if (!normalized.includes(NO_AI_RULE)) normalized.push(NO_AI_RULE);
  return normalized;
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
