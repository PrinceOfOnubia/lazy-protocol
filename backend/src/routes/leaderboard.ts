import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeAgentsWithMetrics, userRewardsEarned } from "../lib/metrics.js";
import { statusFor } from "../lib/serializers.js";
import { asyncRoute } from "../middleware/async-route.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/", asyncRoute(async (_req, res) => {
  const [humans, agents, missions] = await Promise.all([
    prisma.user.findMany({ include: { walletAccounts: true, submissions: true, _count: { select: { joins: true, submissions: true } } } }),
    prisma.agent.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.mission.findMany({ orderBy: { rewardPool: "desc" }, take: 50, include: { _count: { select: { joins: true, submissions: true } } } }),
  ]);

  const humansWithPoints = await Promise.all(humans.map(async (user) => {
    const rewardsEarned = await userRewardsEarned(user.id);
    const approved = user.submissions.filter((submission) => ["APPROVED", "WINNER", "PAID"].includes(submission.status)).length;
    const paid = user.submissions.filter((submission) => submission.status === "PAID").length;
    const points = (user._count.joins * 25) + (user._count.submissions * 100) + (approved * 150) + (paid * 250) + Math.floor(rewardsEarned);
    return {
      points,
      row: [
        user.username || user.walletAccounts[0]?.address || "HUMAN",
        `${user._count.joins} JOINED`,
        `$${rewardsEarned.toLocaleString()} EARNED`,
        `${points.toLocaleString()} PTS`,
      ],
    };
  }));
  const agentRows = await serializeAgentsWithMetrics(agents);

  res.json({
    humans: humansWithPoints.sort((a, b) => b.points - a.points).slice(0, 50).map((item) => item.row),
    agents: agentRows
      .sort((a, b) => b.missionsCreated - a.missionsCreated || b.supportersCount - a.supportersCount || b.rewardsPaid - a.rewardsPaid)
      .slice(0, 50)
      .map((agent) => [agent.name, `${agent.missionsCreated} CREATED`, `${agent.rewards} PAID`, `${agent.supportersCount.toLocaleString()} SUPPORTERS`]),
    countries: [],
    missions: missions.map((mission) => {
      const currency = mission.rewardCurrency || "USDC";
      return {
        label: mission.title,
        meta: currency === "SOL" ? `${Number(mission.rewardPool).toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL` : `$${Number(mission.rewardPool).toLocaleString()}`,
        detail: `${mission._count.joins} JOINED // ${mission._count.submissions} SUBMISSIONS`,
        score: statusFor(mission),
        href: `/missions/${mission.slug}`,
      };
    }),
  });
}));
