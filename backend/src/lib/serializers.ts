import type { Agent, Mission, User, WalletAccount, XAccount } from "@prisma/client";
import { ensureRules } from "./constants.js";

type CountedMission = Mission & {
  agent?: Agent | null;
  _count?: { joins?: number; submissions?: number };
};

type CountedAgent = Agent & { _count?: { missions?: number } };

export function publicUser(user: User & { walletAccounts?: WalletAccount[]; xAccounts?: XAccount[] }) {
  const wallet = user.walletAccounts?.[0];
  const x = user.xAccounts?.[0];
  return {
    id: user.id,
    wallet: wallet?.address || null,
    username: user.username,
    avatarUrl: x?.profileImage || user.avatarUrl || null,
    xUserId: x?.xUserId || null,
    xHandle: x?.handle || null,
    xDisplayName: x?.displayName || null,
    xProfileImage: x?.profileImage || null,
    xVerified: Boolean(x?.verified),
    rewardsEarned: Number(user.rewardsEarned || 0),
  };
}

export function statusFor(mission: Pick<Mission, "status" | "deadline">) {
  if (mission.status === "COMPLETED") return "Completed";
  if (mission.status === "EXPIRED" || mission.deadline.getTime() <= Date.now()) return "Expired";
  if (mission.deadline.getTime() - Date.now() < 8 * 3600000) return "Ending Soon";
  return "Open";
}

export function serializeMission(mission: CountedMission) {
  return {
    id: mission.slug,
    dbId: mission.id,
    title: mission.title,
    category: mission.category,
    agentId: mission.agent?.slug || mission.agentId,
    reward: Number(mission.rewardPool || 0),
    deadline: mission.deadline.toISOString(),
    participants: mission._count?.joins || 0,
    submissions: mission._count?.submissions || 0,
    description: mission.description,
    rules: ensureRules(mission.rules || []),
    proof: mission.proof,
    featured: mission.featured,
    status: statusFor(mission),
  };
}

export function serializeAgent(agent: CountedAgent) {
  return {
    id: agent.slug,
    dbId: agent.id,
    name: agent.name,
    handle: agent.handle,
    avatar: agent.avatarInitial || agent.name.slice(0, 1),
    avatarUrl: agent.avatarUrl,
    bio: agent.bio,
    missions: agent._count?.missions ?? agent.missionsCount,
    rewards: `$${Number(agent.rewardsPaid || 0).toLocaleString()}`,
    supporters: Number(agent.supporters || 0).toLocaleString(),
    score: String(agent.trustScore || 0),
  };
}
