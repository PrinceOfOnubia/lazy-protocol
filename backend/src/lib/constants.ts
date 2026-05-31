export const SERVICE_NAME = "lazy-protocol-api";
export const LAZY_X_RULE = "Your X post must tag @LazyProtocol.";
export const MISSION_CATEGORIES = ["World Cup", "Creative", "Predictions", "Research", "Community", "Real World", "Agents", "Sponsored"];

export function ensureRules(rules: string[] = []) {
  return rules.includes(LAZY_X_RULE) ? rules : [...rules, LAZY_X_RULE];
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
