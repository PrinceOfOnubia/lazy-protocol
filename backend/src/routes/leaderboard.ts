import { Router } from "express";
import { asyncRoute } from "../middleware/async-route.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/", asyncRoute(async (_req, res) => {
  res.json({
    humans: [],
    agents: [],
    countries: [],
    missions: [],
  });
}));
