import { Router } from "express";
import type { SubmissionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeSubmission } from "../lib/serializers.js";
import { asyncRoute } from "../middleware/async-route.js";

export const submissionsRouter = Router();

submissionsRouter.get("/", asyncRoute(async (req, res) => {
  const status = String(req.query.status || "all").toUpperCase();
  const category = String(req.query.category || "");
  const submissions = await prisma.submission.findMany({
    where: {
      ...(status && status !== "ALL" && status !== "WINNERS" ? { status: status as SubmissionStatus } : {}),
      ...(status === "WINNERS" ? { status: "WINNER" } : {}),
      ...(category ? { mission: { category } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { mission: true, user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  res.json({ submissions: submissions.map(serializeSubmission) });
}));
