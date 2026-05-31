import type { Agent } from "@prisma/client";
import { prisma } from "./prisma.js";
import { serializeAgent } from "./serializers.js";

export async function userRewardsEarned(userId: string) {
  const result = await prisma.submission.aggregate({
    where: { userId, status: "PAID", payoutStatus: "PAID", payoutCurrency: "USDC" },
    _sum: { payoutAmount: true },
  });
  return Number(result._sum.payoutAmount || 0);
}

export async function agentMetrics(agentId: string) {
  const [missionsCreated, rewards, supporters, submissions, winners, paidWinners] = await Promise.all([
    prisma.mission.count({ where: { agentId } }),
    prisma.submission.groupBy({
      by: ["payoutCurrency"],
      where: { mission: { agentId }, status: "PAID", payoutStatus: "PAID" },
      _sum: { payoutAmount: true },
    }),
    prisma.missionJoin.findMany({
      where: { mission: { agentId } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.submission.groupBy({
      by: ["status"],
      where: { mission: { agentId } },
      _count: { status: true },
    }),
    prisma.submission.count({ where: { mission: { agentId }, status: { in: ["WINNER", "PAID"] } } }),
    prisma.submission.count({ where: { mission: { agentId }, status: "PAID", payoutStatus: "PAID" } }),
  ]);

  const totalSubmissions = submissions.reduce((sum, row) => sum + row._count.status, 0);
  const approved = submissions
    .filter((row) => ["APPROVED", "WINNER", "PAID"].includes(row.status))
    .reduce((sum, row) => sum + row._count.status, 0);
  const reviewScore = totalSubmissions ? approved / totalSubmissions : 0;
  const payoutScore = winners ? paidWinners / winners : 1;
  const trustScore = totalSubmissions ? Math.round(((reviewScore * 0.7) + (payoutScore * 0.3)) * 1000) / 10 : null;

  const rewardsPaid = rewards.find((row) => row.payoutCurrency === "USDC");
  const rewardsPaidSol = rewards.find((row) => row.payoutCurrency === "SOL");

  return {
    missionsCreated,
    rewardsPaid: Number(rewardsPaid?._sum.payoutAmount || 0),
    rewardsPaidSol: Number(rewardsPaidSol?._sum.payoutAmount || 0),
    supporters: supporters.length,
    trustScore,
  };
}

export async function serializeAgentsWithMetrics(agents: Agent[]) {
  return Promise.all(agents.map(async (agent) => {
    const metrics = await agentMetrics(agent.id);
    return {
      ...serializeAgent(agent),
      missions: metrics.missionsCreated,
      missionsCreated: metrics.missionsCreated,
      rewardsPaid: metrics.rewardsPaid,
      rewardsPaidSol: metrics.rewardsPaidSol,
      rewards: metrics.rewardsPaidSol > 0 ? `$${metrics.rewardsPaid.toLocaleString()} + ${metrics.rewardsPaidSol.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL` : `$${metrics.rewardsPaid.toLocaleString()}`,
      supporters: metrics.supporters.toLocaleString(),
      supportersCount: metrics.supporters,
      trustScore: metrics.trustScore,
      score: metrics.trustScore === null ? "N/A" : String(metrics.trustScore),
    };
  }));
}
