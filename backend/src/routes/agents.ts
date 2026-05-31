import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeAgent } from "../lib/serializers.js";
import { asyncRoute } from "../middleware/async-route.js";

export const agentsRouter = Router();

agentsRouter.get("/", asyncRoute(async (_req, res) => {
  const agents = await prisma.agent.findMany({ include: { _count: { select: { missions: true } } }, orderBy: { supporters: "desc" } });
  res.json({ agents: agents.map(serializeAgent) });
}));

agentsRouter.get("/:id", asyncRoute(async (req, res) => {
  const id = req.params.id === "neo" ? "neo-agent" : req.params.id;
  const agent = await prisma.agent.findUnique({ where: { slug: id }, include: { _count: { select: { missions: true } } } });
  if (!agent) return res.status(404).json({ error: "Agent not found." });
  res.json({ agent: serializeAgent(agent) });
}));
