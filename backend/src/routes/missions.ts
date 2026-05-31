import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ensureRules, MISSION_CATEGORIES, slugify } from "../lib/constants.js";
import { serializeMission, serializeSubmission } from "../lib/serializers.js";
import { rewardWallet, verifyFundingTx } from "../lib/solana.js";
import { validateSafeMission } from "../lib/safety.js";
import { extractPostId, fetchPostAuthor } from "../lib/x.js";
import { isAdminWallet, requireUser } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";

export const missionsRouter = Router();

missionsRouter.get("/", asyncRoute(async (_req, res) => {
  const missions = await prisma.mission.findMany({
    orderBy: [{ featured: "desc" }, { deadline: "asc" }],
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  res.json({ missions: missions.map(serializeMission) });
}));

missionsRouter.get("/funding/config", asyncRoute(async (_req, res) => {
  res.json({ rewardWallet: rewardWallet() });
}));

missionsRouter.get("/:id", asyncRoute(async (req, res) => {
  const mission = await prisma.mission.findUnique({
    where: { slug: req.params.id },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  if (!mission) return res.status(404).json({ error: "Mission not found." });
  res.json({ mission: serializeMission(mission) });
}));

missionsRouter.post("/", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const wallet = user.walletAccounts[0]?.address;
  if (!wallet) return res.status(401).json({ error: "Wallet is required." });

  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.body.agentId } });
  if (!agent.ownerWallet && !isAdminWallet(wallet)) return res.status(403).json({ error: "This agent does not have an owner wallet. Register or claim an agent before creating missions." });
  if (agent.ownerWallet && agent.ownerWallet !== wallet && !isAdminWallet(wallet)) return res.status(403).json({ error: "Only the agent owner can create missions for this agent." });
  if ((!agent.approved || agent.status !== "APPROVED") && !isAdminWallet(wallet)) return res.status(403).json({ error: "This agent must be approved before it can create missions." });

  const rewardCurrency = req.body.rewardCurrency === "SOL" ? "SOL" : "USDC";
  const rewardAmount = Number(req.body.reward ?? req.body.prizePoolAmountSol ?? req.body.amountSol);
  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) return res.status(400).json({ error: "Mission reward pool must be positive." });

  const fundingTxHash = String(req.body.fundingTxHash || req.body.txHash || "");
  const verified = rewardCurrency === "SOL" ? await verifyFundingTx({ txHash: fundingTxHash, fromWallet: wallet, amountSol: rewardAmount }) : null;
  const rules = ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules || "").split("\n").filter(Boolean));
  const category = MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : agent.category;
  validateSafeMission({ title: String(req.body.title), description: String(req.body.description), rules, proof: String(req.body.proof) });
  const mission = await prisma.$transaction(async (tx) => {
    const created = await tx.mission.create({
      data: {
        slug: req.body.slug || slugify(String(req.body.title)),
        title: String(req.body.title),
        category,
        agentId: agent.id,
        createdById: user.id,
        createdByType: isAdminWallet(wallet) ? "ADMIN" : "AGENT_OWNER",
        createdByWallet: wallet,
        rewardPool: rewardAmount,
        rewardCurrency,
        prizePoolAmountSol: rewardCurrency === "SOL" ? rewardAmount : null,
        fundingTxHash,
        funderWallet: wallet,
        rewardWallet: verified?.toWallet,
        fundingStatus: verified ? "CONFIRMED" : "PENDING",
        deadline: new Date(req.body.deadline),
        description: String(req.body.description),
        rules,
        proof: String(req.body.proof),
      },
      include: { agent: true, _count: { select: { joins: true, submissions: true } } },
    });
    if (verified) {
      await tx.fundingTransaction.create({
        data: { txHash: fundingTxHash, type: "MISSION_FUND", missionId: created.id, fromWallet: wallet, toWallet: verified.toWallet, amountSol: rewardAmount, status: "CONFIRMED" },
      });
    }
    await tx.agent.update({
      where: { id: agent.id },
      data: { missionsCount: { increment: 1 } },
    });
    return created;
  });
  res.status(201).json({ mission: serializeMission(mission) });
}));

missionsRouter.post("/:id/join", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  await prisma.missionJoin.upsert({
    where: { userId_missionId: { userId: user.id, missionId: mission.id } },
    update: {},
    create: { userId: user.id, missionId: mission.id },
  });
  res.json({ ok: true });
}));

missionsRouter.post("/:id/boost", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const wallet = user.walletAccounts[0]?.address;
  if (!wallet) return res.status(401).json({ error: "Wallet is required." });
  const amount = Number(req.body.amount ?? req.body.amountSol);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Boost amount must be positive." });
  const boostTxHash = String(req.body.boostTxHash || req.body.txHash || "");
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  const currency = req.body.currency === "SOL" ? "SOL" : req.body.currency === "USDC" ? "USDC" : mission.rewardCurrency;
  if (currency !== mission.rewardCurrency) return res.status(400).json({ error: `Boost currency must match mission currency (${mission.rewardCurrency}).` });
  const verified = boostTxHash && currency === "SOL" ? await verifyFundingTx({ txHash: boostTxHash, fromWallet: wallet, amountSol: amount }) : null;
  const boost = await prisma.$transaction(async (tx) => {
    if (verified) {
      await tx.fundingTransaction.create({
        data: { txHash: boostTxHash, type: "BOOST", missionId: mission.id, fromWallet: wallet, toWallet: verified.toWallet, amountSol: amount, status: "CONFIRMED" },
      });
    }
    const created = await tx.rewardBoost.create({
      data: { userId: user.id, missionId: mission.id, amount, currency, amountSol: verified ? amount : null, txSignature: boostTxHash || null, boosterWallet: wallet, status: "CONFIRMED" },
    });
    await tx.mission.update({ where: { id: mission.id }, data: { rewardPool: { increment: amount } } });
    return created;
  });
  res.status(201).json({ boost });
}));

missionsRouter.post("/:id/submissions", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  if (user.status === "SUSPENDED") return res.status(403).json({ error: "This user is suspended from submitting." });
  const xAccount = user.xAccounts[0];
  if (!xAccount?.verified) return res.status(403).json({ error: "Connect and verify your X account before submitting." });

  const xPostUrl = String(req.body.xPostUrl || req.body.x || req.body.proofUrl || "");
  const xPostId = extractPostId(xPostUrl);
  if (!xPostId) return res.status(400).json({ error: "A valid x.com or twitter.com post link is required." });

  const author = await fetchPostAuthor(xPostId);
  if (author.authorId !== xAccount.xUserId) return res.status(400).json({ error: "This post does not belong to your connected X account." });
  if (!author.text.toLowerCase().includes("@lazyprotocol")) return res.status(400).json({ error: "Submitted X post must tag @LazyProtocol." });

  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  await prisma.missionJoin.upsert({
    where: { userId_missionId: { userId: user.id, missionId: mission.id } },
    update: {},
    create: { userId: user.id, missionId: mission.id },
  });
  const submission = await prisma.submission.create({
    data: {
      userId: user.id,
      missionId: mission.id,
      title: String(req.body.title),
      description: String(req.body.description),
      proofUrl: String(req.body.proofUrl || req.body.proof || xPostUrl),
      xPostUrl,
      mediaUrl: req.body.mediaUrl || req.body.media,
      xPostId,
      xAuthorId: author.authorId,
      xAuthorHandle: author.handle || xAccount.handle,
    },
  });
  const created = await prisma.submission.findUniqueOrThrow({
    where: { id: submission.id },
    include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  res.status(201).json({ submission: serializeSubmission(created) });
}));

missionsRouter.get("/:id/submissions", asyncRoute(async (req, res) => {
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  const submissions = await prisma.submission.findMany({
    where: { missionId: mission.id },
    orderBy: { createdAt: "desc" },
    include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  res.json({ submissions: submissions.map(serializeSubmission) });
}));
