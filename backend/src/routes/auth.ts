import crypto from "node:crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { publicUser } from "../lib/serializers.js";
import { fetchXUserFromCode } from "../lib/x.js";
import { requireUser } from "../middleware/auth.js";
import { asyncRoute } from "../middleware/async-route.js";

export const authRouter = Router();
const xSessions = new Map<string, { verifier: string; wallet: string; expires: number }>();

authRouter.post("/wallet", asyncRoute(async (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Wallet is required." });

  // Security roadmap: require a signed wallet message before unrestricted launch.
  const account = await prisma.walletAccount.upsert({
    where: { address: wallet },
    update: {},
    create: {
      address: wallet,
      user: { create: { username: `HUMAN_${wallet.slice(0, 4).toUpperCase()}` } },
    },
    include: { user: { include: { walletAccounts: true, xAccounts: true } } },
  });
  res.json({ user: publicUser(account.user) });
}));

authRouter.post("/x/start", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const wallet = user.walletAccounts[0]?.address;
  if (!wallet) return res.status(401).json({ error: "Wallet is required." });
  if (!process.env.X_CLIENT_ID || !process.env.X_CALLBACK_URL) {
    return res.status(503).json({ error: "X verification is temporarily unavailable." });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  xSessions.set(state, { verifier, wallet, expires: Date.now() + 10 * 60 * 1000 });

  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.X_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.X_CALLBACK_URL);
  url.searchParams.set("scope", "tweet.read users.read offline.access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  res.json({ url: url.toString() });
}));

authRouter.get("/x/callback", asyncRoute(async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:4173";
  const session = xSessions.get(String(req.query.state));
  if (!session || session.expires < Date.now()) return res.redirect(`${frontendUrl}/profile?x_error=expired`);
  xSessions.delete(String(req.query.state));

  const xUser = await fetchXUserFromCode(String(req.query.code), session.verifier);
  const account = await prisma.walletAccount.findUniqueOrThrow({ where: { address: session.wallet } });
  await prisma.xAccount.upsert({
    where: { xUserId: xUser.id },
    update: {
      userId: account.userId,
      handle: xUser.username,
      displayName: xUser.name,
      profileImage: xUser.profile_image_url,
      verified: true,
    },
    create: {
      userId: account.userId,
      xUserId: xUser.id,
      handle: xUser.username,
      displayName: xUser.name,
      profileImage: xUser.profile_image_url,
      verified: true,
    },
  });
  res.redirect(`${frontendUrl}/profile?x_verified=1`);
}));

authRouter.get("/x/status", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const x = user.xAccounts[0];
  res.json({ connected: Boolean(x?.verified), xAccount: x || null });
}));

authRouter.delete("/x", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  await prisma.xAccount.deleteMany({ where: { userId: user.id } });
  const updated = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { walletAccounts: true, xAccounts: true },
  });
  res.json({ user: publicUser(updated), connected: false });
}));
