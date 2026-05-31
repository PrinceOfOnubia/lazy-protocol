import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { publicUser } from "../lib/serializers.js";
import { requireUser } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";

export const usersRouter = Router();

usersRouter.get("/me", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const [joins, submissions, boosts] = await Promise.all([
    prisma.missionJoin.findMany({ where: { userId: user.id }, include: { mission: true } }),
    prisma.submission.findMany({ where: { userId: user.id }, include: { mission: true } }),
    prisma.rewardBoost.findMany({ where: { userId: user.id }, include: { mission: true } }),
  ]);
  res.json({
    user: {
      ...publicUser(user),
      missionsJoined: joins.length,
      submissions: submissions.length,
      boostedMissions: boosts.length,
      joinedMissionIds: joins.map((join) => join.mission.slug),
      submittedMissionIds: submissions.map((submission) => submission.mission.slug),
      boostedMissionIds: boosts.map((boost) => boost.mission.slug),
    },
  });
}));

usersRouter.patch("/me", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { username: req.body.username, avatarUrl: req.body.avatarUrl },
    include: { walletAccounts: true, xAccounts: true },
  });
  res.json({ user: publicUser(updated) });
}));
