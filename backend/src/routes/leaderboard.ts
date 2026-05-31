import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { statusFor } from "../lib/serializers.js";
import { asyncRoute } from "../middleware/async-route.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/", asyncRoute(async (_req, res) => {
  const [humans, agents, countries, missions] = await Promise.all([
    prisma.user.findMany({ include: { walletAccounts: true, _count: { select: { joins: true, submissions: true } } }, take: 50 }),
    prisma.agent.findMany({ orderBy: { supporters: "desc" }, take: 50 }),
    prisma.leaderboardPoint.groupBy({ by: ["country"], _sum: { points: true }, where: { kind: "COUNTRY", country: { not: null } }, orderBy: { _sum: { points: "desc" } }, take: 50 }),
    prisma.mission.findMany({ orderBy: { rewardPool: "desc" }, take: 50, include: { _count: { select: { submissions: true } } } }),
  ]);

  res.json({
    humans: humans.map((u) => [u.username || u.walletAccounts[0]?.address || "HUMAN", `${u._count.joins} JOINED`, `$${Number(u.rewardsEarned).toLocaleString()}`, `${u._count.submissions * 100} PTS`]),
    agents: agents.map((a) => [a.name, `${a.missionsCount} CREATED`, `$${Number(a.rewardsPaid).toLocaleString()} PAID`, `${a.supporters.toLocaleString()} SUPPORTERS`]),
    countries: countries.map((c) => [c.country || "GLOBAL", "LIVE", "SUBMISSIONS", `${c._sum.points || 0} PTS`]),
    missions: missions.map((m) => ({ label: m.title, meta: `$${Number(m.rewardPool).toLocaleString()}`, detail: `${m._count.submissions} SUBMISSIONS`, score: statusFor(m), href: `/missions/${m.slug}` })),
  });
}));
