import { Router } from "express";
import { hashAgentApiKey } from "../lib/agent-auth.js";
import { ensureRules, MISSION_CATEGORIES, slugify } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";
import { validateSafeMission } from "../lib/safety.js";
import { serializeMission } from "../lib/serializers.js";
import { verifyFundingTx } from "../lib/solana.js";
import { asyncRoute } from "../middleware/async-route.js";

export const agentApiRouter = Router();

agentApiRouter.post("/missions", asyncRoute(async (req, res) => {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Agent API key is required." });

  const agent = await prisma.agent.findFirst({ where: { apiKeyHash: hashAgentApiKey(token) } });
  if (!agent) return res.status(401).json({ error: "Invalid agent API key." });
  if (agent.status !== "APPROVED" || !agent.approved) return res.status(403).json({ error: "Agent is not approved for mission creation." });

  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const proof = String(req.body.proof || "Public X post URL tagging @lazy_protocol");
  const rules = ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules || "").split("\n").filter(Boolean));
  const category = MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : agent.category;
  const rewardPool = Number(req.body.rewardPool ?? req.body.reward ?? 0);
  const rewardCurrency = req.body.rewardCurrency === "SOL" ? "SOL" : "USDC";
  if (!title || !description) return res.status(400).json({ error: "Mission title and description are required." });
  if (!Number.isFinite(rewardPool) || rewardPool <= 0) return res.status(400).json({ error: "Reward pool must be positive." });
  if (!agent.ownerWallet) return res.status(403).json({ error: "Agent owner wallet is required for funded mission creation." });
  const fundingTxHash = String(req.body.fundingTxHash || req.body.txHash || "");
  const verified = await verifyFundingTx({ txHash: fundingTxHash, fromWallet: agent.ownerWallet, amount: rewardPool, currency: rewardCurrency });
  validateSafeMission({ title, description, rules, proof });

  const mission = await prisma.$transaction(async (tx) => {
    await tx.agent.update({ where: { id: agent.id }, data: { apiKeyLastUsedAt: new Date() } });
    const mission = await tx.mission.create({
      data: {
        slug: req.body.slug || `${slugify(title)}-${Math.floor(Date.now() / 1000)}`,
        title,
        category,
        description,
        rules,
        proof,
        rewardPool,
        rewardCurrency,
        prizePoolAmountSol: rewardCurrency === "SOL" ? rewardPool : null,
        fundingTxHash,
        funderWallet: agent.ownerWallet,
        rewardWallet: verified.toWallet,
        fundingStatus: "CONFIRMED",
        deadline: req.body.deadline ? new Date(req.body.deadline) : new Date(Date.now() + 48 * 3600000),
        agentId: agent.id,
        createdByType: "AGENT_API",
        createdByWallet: agent.ownerWallet,
        featured: Boolean(req.body.featured),
      },
      include: { agent: true, _count: { select: { joins: true, submissions: true } } },
    });
    await tx.fundingTransaction.create({
      data: { txHash: fundingTxHash, type: "MISSION_FUND", missionId: mission.id, fromWallet: agent.ownerWallet!, toWallet: verified.toWallet, currency: rewardCurrency, amount: rewardPool, amountSol: rewardCurrency === "SOL" ? rewardPool : 0, status: "CONFIRMED", confirmedAt: new Date() },
    });
    return mission;
  });

  res.status(201).json({ mission: serializeMission(mission) });
}));
