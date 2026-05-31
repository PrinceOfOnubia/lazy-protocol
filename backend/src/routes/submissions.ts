import { Router } from "express";
import type { SubmissionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeSubmission } from "../lib/serializers.js";
import { asyncRoute } from "../middleware/async-route.js";

export const submissionsRouter = Router();

submissionsRouter.get("/", asyncRoute(async (req, res) => {
  const status = String(req.query.status || "all").toUpperCase();
  const category = String(req.query.category || "");
  const missionId = String(req.query.missionId || "");
  const mission = missionId ? await prisma.mission.findFirst({ where: { OR: [{ id: missionId }, { slug: missionId }] } }) : null;
  const submissions = await prisma.submission.findMany({
    where: {
      ...(status && status !== "ALL" && status !== "WINNERS" ? { status: status as SubmissionStatus } : {}),
      ...(status === "WINNERS" ? { status: { in: ["WINNER", "PAID"] } } : {}),
      ...(category ? { mission: { category } } : {}),
      ...(missionId ? { missionId: mission?.id || "__missing_mission__" } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  res.json(submissions.map(serializeSubmission));
}));
