import type { Agent, Mission, Submission, User, WalletAccount, XAccount } from "@prisma/client";
import { ensureRules } from "./constants.js";

type CountedMission = Mission & {
  agent?: Agent | null;
  _count?: { joins?: number; submissions?: number };
};

type CountedAgent = Agent & { _count?: { missions?: number } };
type DetailedSubmission = Submission & {
  mission?: Mission | null;
  user?: (User & { walletAccounts?: WalletAccount[]; xAccounts?: XAccount[] }) | null;
};

export function publicUser(user: User & { walletAccounts?: WalletAccount[]; xAccounts?: XAccount[] }) {
  const wallet = user.walletAccounts?.[0];
  const x = user.xAccounts?.[0];
  return {
    id: user.id,
    wallet: wallet?.address || null,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
    status: user.status || "ACTIVE",
    xUserId: x?.xUserId || null,
    xHandle: x?.handle || null,
    xDisplayName: x?.displayName || null,
    xProfileImage: x?.profileImage || null,
    xVerified: Boolean(x?.verified),
    rewardsEarned: Number(user.rewardsEarned || 0),
  };
}

export function serializeSubmission(submission: DetailedSubmission) {
  const wallet = submission.user?.walletAccounts?.[0]?.address || null;
  const xHandle = submission.xAuthorHandle || submission.user?.xAccounts?.[0]?.handle || null;
  return {
    id: submission.id,
    missionId: submission.mission?.slug || submission.missionId,
    missionTitle: submission.mission?.title || "",
    missionCategory: submission.mission?.category || "",
    title: submission.title,
    description: submission.description,
    proofUrl: submission.proofUrl,
    postUrl: submission.xPostUrl,
    xPostUrl: submission.xPostUrl,
    submitterWallet: wallet,
    user: submission.user?.username || wallet,
    xHandle,
    status: submission.status,
    adminNote: submission.adminNote || null,
    payoutAmount: submission.payoutAmount === null ? null : Number(submission.payoutAmount || 0),
    payoutWallet: submission.payoutWallet || wallet,
    payoutTxHash: submission.payoutTxHash || null,
    payoutStatus: submission.payoutStatus || "UNPAID",
    payoutNote: submission.payoutNote || null,
    paidAt: submission.paidAt?.toISOString() || null,
    createdAt: submission.createdAt.toISOString(),
    created: submission.createdAt.toISOString(),
  };
}

export function statusFor(mission: Pick<Mission, "status" | "deadline">) {
  if (mission.status === "COMPLETED") return "Completed";
  if (mission.status === "UNDER_REVIEW") return "Under Review";
  if (mission.status === "REMOVED") return "Removed";
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
    prizePoolAmountSol: mission.prizePoolAmountSol === null ? null : Number(mission.prizePoolAmountSol || 0),
    fundingTxHash: mission.fundingTxHash,
    funderWallet: mission.funderWallet,
    rewardWallet: mission.rewardWallet,
    fundingStatus: mission.fundingStatus,
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
    category: agent.category,
    ownerWallet: agent.ownerWallet,
    approved: agent.approved,
    featured: agent.featured,
    missions: agent._count?.missions ?? agent.missionsCount,
    rewards: `$${Number(agent.rewardsPaid || 0).toLocaleString()}`,
    supporters: Number(agent.supporters || 0).toLocaleString(),
    score: String(agent.trustScore || 0),
  };
}
