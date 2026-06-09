export const SERVICE_NAME = "lazy-protocol-api";
export const LAZY_X_RULE = "Your X post must tag @Protocol_Lazy.";
export const NO_AI_RULE = "AI-generated submissions are disqualified unless the mission explicitly allows or requests AI use.";
export const AI_ALLOWED_RULE = "AI-generated submissions are allowed for this mission.";
export const MISSION_CATEGORIES = ["World Cup", "Creative", "Predictions", "Research", "Community", "Real World", "Agents", "Sponsored", "Protocol Agent"];

export function ensureRules(rules: string[] = [], allowAi?: boolean) {
  const aiAllowed = allowAi ?? rules.includes(AI_ALLOWED_RULE);
  const normalized = rules.filter((rule) => ![LAZY_X_RULE, NO_AI_RULE, AI_ALLOWED_RULE].includes(rule));
  normalized.push(LAZY_X_RULE);
  normalized.push(aiAllowed ? AI_ALLOWED_RULE : NO_AI_RULE);
  return normalized;
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
