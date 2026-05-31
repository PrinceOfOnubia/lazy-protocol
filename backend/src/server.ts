import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { SERVICE_NAME } from "./lib/constants.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { missionsRouter } from "./routes/missions.js";
import { agentsRouter } from "./routes/agents.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { adminRouter } from "./routes/admin.js";

const app = express();
const port = Number(process.env.PORT || 8080);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, service: SERVICE_NAME }));
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/missions", missionsRouter);
app.use("/agents", agentsRouter);
app.use("/leaderboard", leaderboardRouter);
app.use("/admin", adminRouter);

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error." });
});

app.listen(port, () => {
  console.log(`${SERVICE_NAME} listening on ${port}`);
});
