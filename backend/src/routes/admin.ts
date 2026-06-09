import { Router } from "express";
import type { Request } from "express";
import type { AgentStatus, MissionStatus, SubmissionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ensureRules, MISSION_CATEGORIES, slugify } from "../lib/constants.js";
import { serializeAgentsWithMetrics, userRewardsEarned } from "../lib/metrics.js";
import { serializeAgent, serializeMission, publicUser, serializeSubmission } from "../lib/serializers.js";
import { validateSafeMission } from "../lib/safety.js";
import { verifyFundingTx } from "../lib/solana.js";
import { requireAdmin } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";
import { clawPumpStatus, testClawPumpConnection } from "../services/clawpump.js";
import { createLazarusMission, generateLazarusDescription, lazarusAiStatus, lazarusMemorySummary, lazarusMissionTemplates } from "../services/lazarus.js";

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
    integrations: { clawpump: clawPumpStatus(), lazarusTemplates: lazarusMissionTemplates(), lazarusAi: lazarusAiStatus(), lazarusMemory: await lazarusMemorySummary() },
    actions,
    fundingTransactions: fundingTransactions.map((tx) => ({
      id: tx.id,
      txHash: tx.txHash,
      type: tx.type,
      missionId: tx.mission?.slug || tx.missionId,
      missionTitle: tx.mission?.title || "",
      fromWallet: tx.fromWallet,
      toWallet: tx.toWallet,
      currency: tx.currency,
      amount: Number(tx.amount || tx.amountSol || 0),
      amountSol: Number(tx.amountSol || 0),
      status: tx.status,
      confirmedAt: tx.confirmedAt?.toISOString() || null,
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
    boosts: user.rewardBoosts.map((boost) => ({ id: boost.id, missionTitle: boost.mission.title, amount: Number(boost.amount), currency: boost.currency, createdAt: boost.createdAt.toISOString() })),
    notes: user.adminNotes.map((note) => ({ id: note.id, note: note.note, createdAt: note.createdAt.toISOString() })),
  });
}));

adminRouter.post("/missions", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.body.agentId } });
  const category = MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : "Community";
  const rules = ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules || "").split("\n").filter(Boolean), Boolean(req.body.allowAi));
  const rewardCurrency = req.body.rewardCurrency === "SOL" ? "SOL" : "USDC";
  const rewardAmount = Number(req.body.reward);
  const fundingTxHash = String(req.body.fundingTxHash || req.body.txHash || "");
  const adminWallet = admin.walletAccounts[0]?.address || "";
  const verified = await verifyFundingTx({ txHash: fundingTxHash, fromWallet: adminWallet, amount: rewardAmount, currency: rewardCurrency });
  validateSafeMission({ title: String(req.body.title), description: String(req.body.description), rules, proof: String(req.body.proof) });
  const mission = await prisma.$transaction(async (tx) => {
    const created = await tx.mission.create({
      data: {
        slug: req.body.slug || slugify(String(req.body.title)),
        title: String(req.body.title),
        category,
        agentId: agent.id,
        createdById: admin.id,
        createdByType: "ADMIN",
        createdByWallet: adminWallet,
        rewardPool: rewardAmount,
        rewardCurrency,
        prizePoolAmountSol: rewardCurrency === "SOL" ? rewardAmount : undefined,
        fundingTxHash,
        funderWallet: adminWallet,
        rewardWallet: verified.toWallet,
        fundingStatus: "CONFIRMED",
        deadline: new Date(req.body.deadline),
        description: String(req.body.description),
        rules,
        proof: String(req.body.proof),
        featured: Boolean(req.body.featured),
      },
      include: { agent: true, _count: { select: { joins: true, submissions: true } } },
    });
    await tx.fundingTransaction.create({
      data: { txHash: fundingTxHash, type: "MISSION_FUND", missionId: created.id, fromWallet: adminWallet, toWallet: verified.toWallet, currency: rewardCurrency, amount: rewardAmount, amountSol: rewardCurrency === "SOL" ? rewardAmount : 0, status: "CONFIRMED", confirmedAt: new Date() },
    });
    return created;
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "MISSION_CREATED", targetType: "mission", targetId: mission.id } });
  res.status(201).json({ mission: serializeMission(mission) });
}));

adminRouter.patch("/missions/:id", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const rewardIncrement = Number(req.body.rewardBoost || 0);
  if (rewardIncrement > 0) return res.status(400).json({ error: "Reward boosts must be funded through /missions/:id/boost before the pool can increase." });
  const rewardCurrency = req.body.rewardCurrency === "SOL" ? "SOL" : req.body.rewardCurrency === "USDC" ? "USDC" : undefined;
  const rules = req.body.rules ? ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules).split("\n").filter(Boolean), req.body.allowAi === undefined ? undefined : Boolean(req.body.allowAi)) : undefined;
  if (req.body.title || req.body.description || rules) {
    validateSafeMission({ title: String(req.body.title || ""), description: String(req.body.description || ""), rules: rules || [], proof: String(req.body.proof || "") });
  }
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
      rewardCurrency,
      prizePoolAmountSol: rewardCurrency === "SOL" && req.body.reward ? Number(req.body.reward) : undefined,
      rules,
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "MISSION_EDITED", targetType: "mission", targetId: mission.id } });
  res.json({ mission: serializeMission(mission) });
}));

adminRouter.patch("/agents/:id", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const requestedStatus = req.body.status ? String(req.body.status).toUpperCase() : undefined;
  const validStatus = requestedStatus && ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(requestedStatus) ? requestedStatus as AgentStatus : undefined;
  const approved = validStatus ? validStatus === "APPROVED" : req.body.approved === undefined ? undefined : Boolean(req.body.approved);
  const agent = await prisma.agent.update({
    where: { slug: req.params.id },
    data: {
      name: req.body.name,
      handle: req.body.handle,
      avatarUrl: req.body.avatarUrl,
      bio: req.body.bio,
      category: req.body.category && MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : undefined,
      ownerWallet: req.body.ownerWallet,
      website: req.body.website,
      xHandle: req.body.xHandle,
      source: req.body.source,
      externalAgentId: req.body.externalAgentId,
      status: validStatus,
      approved,
      featured: req.body.featured === undefined ? undefined : Boolean(req.body.featured),
    },
    include: { _count: { select: { missions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "AGENT_MANAGED", targetType: "agent", targetId: agent.id } });
  res.json({ agent: serializeAgent(agent) });
}));

adminRouter.post("/agents/:id/api-key/revoke", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const agent = await prisma.agent.update({
    where: { slug: req.params.id },
    data: { apiKeyHash: null, apiKeyCreatedAt: null, apiKeyLastUsedAt: null },
    include: { _count: { select: { missions: true } } },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "AGENT_MANAGED", targetType: "agent", targetId: agent.id, metadata: { apiKeyRevoked: true } } });
  res.json({ agent: serializeAgent(agent) });
}));

adminRouter.get("/integrations/clawpump", asyncRoute(async (_req, res) => {
  res.json({ clawpump: clawPumpStatus() });
}));

adminRouter.post("/integrations/clawpump/test", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  res.json({ clawpump: await testClawPumpConnection() });
}));

adminRouter.post("/lazarus/create-mission", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const adminWallet = admin.walletAccounts[0]?.address || "";
  const rewardCurrency = req.body.rewardCurrency === "SOL" ? "SOL" : "USDC";
  const rewardPool = Number(req.body.rewardPool || req.body.reward || 100);
  const fundingTxHash = String(req.body.fundingTxHash || req.body.txHash || "");
  const verified = await verifyFundingTx({ txHash: fundingTxHash, fromWallet: adminWallet, amount: rewardPool, currency: rewardCurrency });
  const mission = await createLazarusMission({
    type: req.body.type,
    rewardPool,
    rewardCurrency,
    deadlineHours: Number(req.body.deadlineHours || 48),
    description: req.body.description,
    featured: Boolean(req.body.featured),
    adminUserId: admin.id,
    fundingTxHash,
    funderWallet: adminWallet,
    rewardWallet: verified.toWallet,
  });
  await prisma.fundingTransaction.create({
    data: { txHash: fundingTxHash, type: "MISSION_FUND", missionId: mission.dbId || mission.id, fromWallet: adminWallet, toWallet: verified.toWallet, currency: rewardCurrency, amount: rewardPool, amountSol: rewardCurrency === "SOL" ? rewardPool : 0, status: "CONFIRMED", confirmedAt: new Date() },
  });
  await prisma.adminAction.create({ data: { adminUserId: admin.id, type: "MISSION_CREATED", targetType: "mission", targetId: mission.dbId || mission.id, metadata: { source: "LAZARUS" } } });
  res.status(201).json({ mission });
}));

adminRouter.post("/lazarus/generate-description", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  res.json({ description: await generateLazarusDescription(req.body.type) });
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
      payoutCurrency: req.body.payoutCurrency === "SOL" ? "SOL" : "USDC",
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
