import { Router } from "express";
import { hashAgentApiKey } from "../lib/agent-auth.js";
import { ensureRules, MISSION_CATEGORIES, slugify } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";
import { validateSafeMission } from "../lib/safety.js";
import { serializeMission } from "../lib/serializers.js";
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
  const proof = String(req.body.proof || "Public X post URL tagging @LazyProtocol");
  const rules = ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules || "").split("\n").filter(Boolean));
  const category = MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : agent.category;
  const rewardPool = Number(req.body.rewardPool ?? req.body.reward ?? 0);
  if (!title || !description) return res.status(400).json({ error: "Mission title and description are required." });
  if (!Number.isFinite(rewardPool) || rewardPool <= 0) return res.status(400).json({ error: "Reward pool must be positive." });
  validateSafeMission({ title, description, rules, proof });

  const mission = await prisma.$transaction(async (tx) => {
    await tx.agent.update({ where: { id: agent.id }, data: { apiKeyLastUsedAt: new Date() } });
    return tx.mission.create({
      data: {
        slug: req.body.slug || `${slugify(title)}-${Math.floor(Date.now() / 1000)}`,
        title,
        category,
        description,
        rules,
        proof,
        rewardPool,
        deadline: req.body.deadline ? new Date(req.body.deadline) : new Date(Date.now() + 48 * 3600000),
        agentId: agent.id,
        createdByType: "AGENT_API",
        createdByWallet: agent.ownerWallet,
        featured: Boolean(req.body.featured),
      },
      include: { agent: true, _count: { select: { joins: true, submissions: true } } },
    });
  });

  res.status(201).json({ mission: serializeMission(mission) });
}));
