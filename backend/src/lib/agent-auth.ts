import crypto from "node:crypto";
import type { Agent, User } from "@prisma/client";
import { isAdminWallet } from "../middleware/auth.js";

export function generateAgentApiKey() {
  return `lp_agent_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashAgentApiKey(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function userCanManageAgent(user: User & { walletAccounts?: { address: string }[] }, agent: Pick<Agent, "ownerWallet">) {
  const wallet = user.walletAccounts?.[0]?.address;
  return Boolean(wallet && (wallet === agent.ownerWallet || isAdminWallet(wallet)));
}

export function apiKeyStatus(agent: Pick<Agent, "apiKeyHash" | "apiKeyCreatedAt" | "apiKeyLastUsedAt">) {
  return {
    hasApiKey: Boolean(agent.apiKeyHash),
    apiKeyCreatedAt: agent.apiKeyCreatedAt?.toISOString() || null,
    apiKeyLastUsedAt: agent.apiKeyLastUsedAt?.toISOString() || null,
  };
}
