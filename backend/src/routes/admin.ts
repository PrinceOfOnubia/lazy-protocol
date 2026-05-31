import { Router } from "express";
import type { Request } from "express";
import type { MissionStatus, SubmissionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ensureRules, MISSION_CATEGORIES, slugify } from "../lib/constants.js";
import { serializeAgentsWithMetrics, userRewardsEarned } from "../lib/metrics.js";
import { serializeAgent, serializeMission, publicUser, serializeSubmission } from "../lib/serializers.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";

export const adminRouter = Router();

adminRouter.get("/overview", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const [users, missions, submissions, boosts, agents, actions, fundingTransactions] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { walletAccounts: true, xAccounts: true, _count: { select: { joins: true, submissions: true } } } }),
    prisma.mission.findMany({ orderBy: { createdAt: "desc" }, include: { agent: true, _count: { select: { joins: true, submissions: true } } } }),
    prisma.submission.findMany({ orderBy: { createdAt: "desc" }, include: { user: { include: { walletAccounts: true, xAccounts: true } }, mission: true } }),
    prisma.rewardBoost.findMany({ orderBy: { createdAt: "desc" }, include: { user: { include: { walletAccounts: true } }, mission: true } }),
    prisma.agent.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { missions: true } } } }),
    prisma.adminAction.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.fundingTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { mission: true } }),
  ]);
  const agentRows = await serializeAgentsWithMetrics(agents);
  const userRows = await Promise.all(users.map(async (user) => ({ ...publicUser(user), rewardsEarned: await userRewardsEarned(user.id), missionsJoined: user._count.joins, submissions: user._count.submissions })));
  res.json({
    categories: MISSION_CATEGORIES,
    users: userRows,
    missions: missions.map(serializeMission),
    submissions: submissions.map(serializeSubmission),
    boosts,
    agents: agentRows,
    actions,
    fundingTransactions: fundingTransactions.map((tx) => ({
      id: tx.id,
      txHash: tx.txHash,
      type: tx.type,
      missionId: tx.mission?.slug || tx.missionId,
      missionTitle: tx.mission?.title || "",
      fromWallet: tx.fromWallet,
      toWallet: tx.toWallet,
      amountSol: Number(tx.amountSol || 0),
      status: tx.status,
      createdAt: tx.createdAt.toISOString(),
    })),
  });
}));

adminRouter.get("/users", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const search = String(req.query.search || "").toLowerCase();
  const filter = String(req.query.filter || "all");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { walletAccounts: true, xAccounts: true, submissions: true, joins: true, _count: { select: { joins: true, submissions: true, rewardBoosts: true } } },
  });
  const rows = await Promise.all(users.map(async (user) => {
    const base = publicUser(user);
    const winners = user.submissions.filter((submission) => ["WINNER", "PAID"].includes(submission.status)).length;
    const disqualified = user.submissions.filter((submission) => submission.status === "DISQUALIFIED").length;
    return {
      ...base,
      id: user.id,
      missionsJoined: user._count.joins,
      submissions: user._count.submissions,
      rewardsEarned: await userRewardsEarned(user.id),
      winners,
      disqualified,
      boosts: user._count.rewardBoosts,
      createdAt: user.createdAt.toISOString(),
    };
  }));
  const filtered = rows.filter((user) => {
    const haystack = `${user.wallet || ""} ${user.username || ""} ${user.xHandle || ""}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (filter === "x-verified") return user.xVerified;
    if (filter === "winners") return user.winners > 0;
    if (filter === "disqualified") return user.disqualified > 0;
    if (filter === "active") return user.status === "ACTIVE";
    return true;
  });
  res.json({ users: filtered });
}));

adminRouter.get("/users/:id", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      walletAccounts: true,
      xAccounts: true,
      joins: { include: { mission: true } },
      submissions: { include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } } },
      rewardBoosts: { include: { mission: true } },
      adminNotes: { orderBy: { createdAt: "desc" } },
    },
  });
  res.json({
    user: { ...publicUser(user), rewardsEarned: await userRewardsEarned(user.id) },
    joins: user.joins.map((join) => ({ id: join.id, missionId: join.mission.slug, missionTitle: join.mission.title, createdAt: join.createdAt.toISOString() })),
    submissions: user.submissions.map(serializeSubmission),
    boosts: user.rewardBoosts.map((boost) => ({ id: boost.id, missionTitle: boost.mission.title, amount: Number(boost.amount), createdAt: boost.createdAt.toISOString() })),
    notes: user.adminNotes.map((note) => ({ id: note.id, note: note.note, createdAt: note.createdAt.toISOString() })),
  });
}));

adminRouter.post("/missions", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.body.agentId } });
  const category = MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : "Community";
  const mission = await prisma.mission.create({
    data: {
      slug: req.body.slug || slugify(String(req.body.title)),
      title: String(req.body.title),
      category,
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
  const rewardIncrement = Number(req.body.rewardBoost || 0);
  const mission = await prisma.mission.update({
    where: { slug: req.params.id },
    data: {
      title: req.body.title,
      category: req.body.category && MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : undefined,
      description: req.body.description,
      status: req.body.status as MissionStatus | undefined,
      featured: req.body.featured,
      deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
      rewardPool: rewardIncrement > 0 ? { increment: rewardIncrement } : undefined,
      rules: req.body.rules ? ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules).split("\n").filter(Boolean)) : undefined,
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "MISSION_EDITED", targetType: "mission", targetId: mission.id } });
  res.json({ mission: serializeMission(mission) });
}));

adminRouter.patch("/agents/:id", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const agent = await prisma.agent.update({
    where: { slug: req.params.id },
    data: {
      name: req.body.name,
      handle: req.body.handle,
      avatarUrl: req.body.avatarUrl,
      bio: req.body.bio,
      category: req.body.category && MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : undefined,
      ownerWallet: req.body.ownerWallet,
      approved: req.body.approved === undefined ? undefined : Boolean(req.body.approved),
      featured: req.body.featured === undefined ? undefined : Boolean(req.body.featured),
    },
    include: { _count: { select: { missions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "AGENT_MANAGED", targetType: "agent", targetId: agent.id } });
  res.json({ agent: serializeAgent(agent) });
}));

async function moderateSubmission(req: Request, status: SubmissionStatus, type: "SUBMISSION_APPROVED" | "SUBMISSION_REJECTED" | "WINNER_MARKED" | "SUBMISSION_DISQUALIFIED") {
  const admin = await requireAdmin(req);
  const current = await prisma.submission.findUniqueOrThrow({ where: { id: req.params.id } });
  if (status === "WINNER" && current.status === "DISQUALIFIED") {
    const error = new Error("Disqualified submissions cannot be marked winner.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
  const submission = await prisma.submission.update({
    where: { id: req.params.id },
    data: { status, rejectionReason: req.body.reason, adminNote: req.body.note },
    include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type, targetType: "submission", targetId: submission.id, reason: req.body.reason, metadata: { note: req.body.note || null } } });
  return serializeSubmission(submission);
}

adminRouter.post("/submissions/:id/approve", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "APPROVED", "SUBMISSION_APPROVED") })));
adminRouter.post("/submissions/:id/reject", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "REJECTED", "SUBMISSION_REJECTED") })));
adminRouter.post("/submissions/:id/mark-winner", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "WINNER", "WINNER_MARKED") })));
adminRouter.post("/submissions/:id/disqualify", asyncRoute(async (req, res) => res.json({ submission: await moderateSubmission(req, "DISQUALIFIED", "SUBMISSION_DISQUALIFIED") })));

adminRouter.post("/submissions/:id/mark-paid", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const amount = req.body.payoutAmount === undefined ? undefined : Number(req.body.payoutAmount);
  const submission = await prisma.submission.update({
    where: { id: req.params.id },
    data: {
      status: "PAID",
      payoutStatus: "PAID",
      payoutAmount: amount,
      payoutWallet: req.body.payoutWallet,
      payoutTxHash: req.body.payoutTxHash,
      payoutNote: req.body.payoutNote,
      paidAt: new Date(),
    },
    include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "SUBMISSION_PAID", targetType: "submission", targetId: submission.id, metadata: { payoutTxHash: req.body.payoutTxHash || null } } });
  res.json({ submission: serializeSubmission(submission) });
}));

adminRouter.post("/users/:id/notes", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const note = await prisma.adminNote.create({ data: { userId: req.params.id, adminUserId: admin.id, note: String(req.body.note || "") } });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "ADMIN_NOTE_ADDED", targetType: "user", targetId: req.params.id } });
  res.status(201).json({ note });
}));

adminRouter.post("/users/:id/suspend", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: "SUSPENDED" }, include: { walletAccounts: true, xAccounts: true } });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "USER_SUSPENDED", targetType: "user", targetId: req.params.id, reason: req.body.reason } });
  res.json({ user: publicUser(user) });
}));

adminRouter.post("/users/:id/unsuspend", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { status: "ACTIVE" }, include: { walletAccounts: true, xAccounts: true } });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "USER_UNSUSPENDED", targetType: "user", targetId: req.params.id } });
  res.json({ user: publicUser(user) });
}));
