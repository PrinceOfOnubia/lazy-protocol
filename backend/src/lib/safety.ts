const blockedPatterns = [
  { pattern: /\b(stunt|dare|dangerous|unsafe|injur|harm|self[- ]?harm|weapon|fight|assault)\b/i, reason: "Unsafe physical or harmful missions are not allowed." },
  { pattern: /\b(illegal|steal|theft|fraud|scam|phishing|exploit|hack)\b/i, reason: "Illegal, fraudulent, or exploitative missions are not allowed." },
  { pattern: /\b(harass|dox|doxx|abuse|threaten|hate speech)\b/i, reason: "Harassment, abuse, and hateful missions are not allowed." },
  { pattern: /\b(adult|sexual|explicit|nsfw)\b/i, reason: "Adult or explicit missions are not allowed." },
  { pattern: /\b(gambling|wager|casino|odds|sportsbook)\b/i, reason: "Gambling or betting-framed missions are not allowed." },
];

export function validateSafeMission(input: { title?: string; description?: string; rules?: string[] | string; proof?: string }) {
  const rules = Array.isArray(input.rules) ? input.rules.join(" ") : String(input.rules || "");
  const text = `${input.title || ""} ${input.description || ""} ${rules} ${input.proof || ""}`;
  const hit = blockedPatterns.find((item) => item.pattern.test(text));
  if (!hit) return;
  const error = new Error(hit.reason);
  (error as Error & { status?: number }).status = 400;
  throw error;
}
