import { Router } from "express";
import type { Request } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureRules, slugify } from "../lib/constants.js";
import { serializeAgent, serializeMission, publicUser, serializeSubmission } from "../lib/serializers.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";

export const adminRouter = Router();

adminRouter.get("/overview", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const [users, missions, submissions, boosts, agents, actions] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { walletAccounts: true, xAccounts: true } }),
    prisma.mission.findMany({ orderBy: { createdAt: "desc" }, include: { agent: true, _count: { select: { joins: true, submissions: true } } } }),
    prisma.submission.findMany({ orderBy: { createdAt: "desc" }, include: { user: { include: { walletAccounts: true, xAccounts: true } }, mission: true } }),
    prisma.rewardBoost.findMany({ orderBy: { createdAt: "desc" }, include: { user: { include: { walletAccounts: true } }, mission: true } }),
    prisma.agent.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { missions: true } } } }),
    prisma.adminAction.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  res.json({ users: users.map(publicUser), missions: missions.map(serializeMission), submissions: submissions.map(serializeSubmission), boosts, agents: agents.map(serializeAgent), actions });
}));

adminRouter.post("/missions", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.body.agentId } });
  const mission = await prisma.mission.create({
    data: {
      slug: req.body.slug || slugify(String(req.body.title)),
      title: String(req.body.title),
      category: String(req.body.category),
      agentId: agent.id,
      createdById: admin.id,
      rewardPool: Number(req.body.reward),
      deadline: new Date(req.body.deadline),
      description: String(req.body.description),
      rules: ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules || "").split("\n").filter(Boolean)),
      proof: String(req.body.proof),
      featured: Boolean(req.body.featured),
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "MISSION_CREATED", targetType: "mission", targetId: mission.id } });
  res.status(201).json({ mission: serializeMission(mission) });
}));

adminRouter.patch("/missions/:id", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const mission = await prisma.mission.update({
    where: { slug: req.params.id },
    data: {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status,
      featured: req.body.featured,
      deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
      rules: req.body.rules ? ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules).split("\n").filter(Boolean)) : undefined,
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "MISSION_EDITED", targetType: "mission", targetId: mission.id } });
  res.json({ mission: serializeMission(mission) });
}));

async function moderateSubmission(req: Request, status: "APPROVED" | "REJECTED" | "WINNER", type: "SUBMISSION_APPROVED" | "SUBMISSION_REJECTED" | "WINNER_MARKED") {
  const admin = await requireAdmin(req);
  const submission = await prisma.submission.update({
    where: { id: req.params.id },
    data: { status, rejectionReason: req.body.reason },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type, targetType: "submission", targetId: submission.id, reason: req.body.reason } });
  return submission;
}

adminRouter.post("/submissions/:id/approve", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "APPROVED", "SUBMISSION_APPROVED") })));
adminRouter.post("/submissions/:id/reject", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "REJECTED", "SUBMISSION_REJECTED") })));
adminRouter.post("/submissions/:id/mark-winner", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "WINNER", "WINNER_MARKED") })));
