import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { MISSION_CATEGORIES, slugify } from "../lib/constants.js";
import { generateAgentApiKey, hashAgentApiKey, userCanManageAgent } from "../lib/agent-auth.js";
import { serializeAgent } from "../lib/serializers.js";
import { serializeAgentsWithMetrics } from "../lib/metrics.js";
import { requireUser } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";

export const agentsRouter = Router();

agentsRouter.get("/", asyncRoute(async (_req, res) => {
  const agents = await prisma.agent.findMany({ orderBy: { createdAt: "asc" } });
  const rows = await serializeAgentsWithMetrics(agents);
  rows.sort((a, b) => b.supportersCount - a.supportersCount || b.missionsCreated - a.missionsCreated);
  res.json({ agents: rows });
}));

agentsRouter.post("/register", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const wallet = user.walletAccounts[0]?.address;
  if (!wallet) return res.status(401).json({ error: "Wallet is required." });

  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Agent name is required." });
  const handle = String(req.body.handle || `@${slugify(name)}`).trim();
  const slug = slugify(String(req.body.slug || name));
  const existing = await prisma.agent.findUnique({ where: { slug } });
  if (existing) return res.status(400).json({ error: "An agent with this name already exists." });

  const agent = await prisma.agent.create({
    data: {
      slug,
      name,
      handle,
      avatarUrl: req.body.avatarUrl ? String(req.body.avatarUrl) : null,
      avatarInitial: name.slice(0, 1).toUpperCase(),
      bio: String(req.body.bio || "Building agent-created missions for the Lazy workforce."),
      category: MISSION_CATEGORIES.includes(String(req.body.category)) ? String(req.body.category) : "Agents",
      ownerWallet: wallet,
      approved: false,
      status: "PENDING",
      source: "EXTERNAL",
      website: req.body.website ? String(req.body.website) : null,
      xHandle: req.body.xHandle ? String(req.body.xHandle) : null,
      featured: false,
      missionsCount: 0,
      rewardsPaid: 0,
      supporters: 0,
      trustScore: 0,
    },
    include: { _count: { select: { missions: true } } },
  });
  res.status(201).json({ agent: serializeAgent(agent) });
}));

agentsRouter.post("/:id/api-key", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.params.id } });
  if (!userCanManageAgent(user, agent)) return res.status(403).json({ error: "Only the agent owner or an admin can manage API keys." });
  if (agent.status !== "APPROVED" || !agent.approved) return res.status(403).json({ error: "Agent must be approved before generating an API key." });
  const apiKey = generateAgentApiKey();
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { apiKeyHash: hashAgentApiKey(apiKey), apiKeyCreatedAt: new Date(), apiKeyLastUsedAt: null },
  });
  res.status(201).json({ apiKey, agent: serializeAgent(updated) });
}));

agentsRouter.post("/:id/api-key/revoke", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.params.id } });
  if (!userCanManageAgent(user, agent)) return res.status(403).json({ error: "Only the agent owner or an admin can manage API keys." });
  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { apiKeyHash: null, apiKeyCreatedAt: null, apiKeyLastUsedAt: null },
  });
  res.json({ agent: serializeAgent(updated) });
}));

agentsRouter.get("/:id", asyncRoute(async (req, res) => {
  const id = req.params.id === "neo" ? "neo-agent" : req.params.id;
  const agent = await prisma.agent.findUnique({ where: { slug: id } });
  if (!agent) return res.status(404).json({ error: "Agent not found." });
  const [row] = await serializeAgentsWithMetrics([agent]);
  res.json({ agent: row });
}));
