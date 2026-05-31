import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 8787);
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:4173";
const adminWallets = new Set((process.env.ADMIN_WALLETS || "").split(",").map((wallet) => wallet.trim()).filter(Boolean));
const xSessions = new Map();
const LAZY_X_RULE = "Your X post must tag @LazyProtocol.";

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    wallet: user.wallet,
    username: user.username,
    avatarUrl: user.xProfileImage || user.avatarUrl || null,
    xUserId: user.xUserId,
    xHandle: user.xHandle,
    xDisplayName: user.xDisplayName,
    xProfileImage: user.xProfileImage,
    xVerified: user.xVerified,
    rewardsEarned: Number(user.rewardsEarned || 0),
    leaderboardPts: user.leaderboardPts,
  };
}

function statusFor(mission) {
  if (mission.status === "COMPLETED") return "Completed";
  if (mission.status === "EXPIRED" || new Date(mission.deadline).getTime() <= Date.now()) return "Expired";
  if (new Date(mission.deadline).getTime() - Date.now() < 8 * 3600000) return "Ending Soon";
  return "Open";
}

function serializeMission(mission) {
  return {
    id: mission.slug,
    dbId: mission.id,
    title: mission.title,
    category: mission.category,
    agentId: mission.agent?.slug || mission.agentId,
    reward: Number(mission.rewardPool || 0),
    deadline: mission.deadline.toISOString(),
    participants: mission._count?.joins || 0,
    submissions: mission._count?.submissions || 0,
    description: mission.description,
    rules: ensureRules(mission.rules || []),
    proof: mission.proof,
    featured: mission.featured,
    status: statusFor(mission),
  };
}

function ensureRules(rules=[]) {
  return rules.includes(LAZY_X_RULE) ? rules : [...rules, LAZY_X_RULE];
}

function serializeAgent(agent) {
  return {
    id: agent.slug,
    dbId: agent.id,
    name: agent.name,
    handle: agent.handle,
    avatar: agent.avatarInitial || agent.name.slice(0, 1),
    avatarUrl: agent.avatarUrl,
    bio: agent.bio,
    missions: agent._count?.missions ?? agent.missionsCount,
    rewards: `$${Number(agent.rewardsPaid || 0).toLocaleString()}`,
    supporters: Number(agent.supporters || 0).toLocaleString(),
    score: String(agent.trustScore || 0),
  };
}

function extractPostId(url) {
  const match = String(url || "").match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i);
  return match?.[1] || null;
}

async function requireUser(req) {
  const wallet = req.headers["x-wallet"] || req.body.wallet || req.query.wallet;
  if (!wallet) {
    const error = new Error("Wallet is required.");
    error.status = 401;
    throw error;
  }
  return prisma.user.findUniqueOrThrow({ where: { wallet: String(wallet) } });
}

async function requireAdmin(req) {
  const user = await requireUser(req);
  if (!adminWallets.has(user.wallet)) {
    const error = new Error("Admin wallet is not allowed.");
    error.status = 403;
    throw error;
  }
  return user;
}

async function fetchXUserFromCode(code, verifier) {
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: process.env.X_CLIENT_ID || "",
    redirect_uri: process.env.X_CALLBACK_URL || "",
    code_verifier: verifier,
  });
  const basic = Buffer.from(`${process.env.X_CLIENT_ID || ""}:${process.env.X_CLIENT_SECRET || ""}`).toString("base64");
  const tokenResponse = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` },
    body,
  });
  if (!tokenResponse.ok) throw new Error("X OAuth token exchange failed.");
  const token = await tokenResponse.json();
  const userResponse = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url,name,username", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userResponse.ok) throw new Error("X user lookup failed.");
  const user = await userResponse.json();
  return user.data;
}

async function fetchPostAuthor(postId) {
  if (!process.env.X_BEARER_TOKEN) throw new Error("X_BEARER_TOKEN is not configured.");
  const response = await fetch(`https://api.x.com/2/tweets/${postId}?tweet.fields=author_id,text&expansions=author_id&user.fields=username`, {
    headers: { authorization: `Bearer ${process.env.X_BEARER_TOKEN}` },
  });
  if (!response.ok) throw new Error("Unable to verify X post ownership.");
  const payload = await response.json();
  return {
    authorId: payload.data?.author_id,
    handle: payload.includes?.users?.[0]?.username,
    text: payload.data?.text || "",
  };
}

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/auth/wallet", asyncRoute(async (req, res) => {
  const { wallet } = req.body;
  if (!wallet) return res.status(400).json({ error: "Wallet is required." });
  const user = await prisma.user.upsert({
    where: { wallet },
    update: {},
    create: { wallet, username: `HUMAN_${wallet.slice(0, 4).toUpperCase()}` },
    include: { joins: true, submissions: true, rewardBoosts: true },
  });
  res.json({ user: publicUser(user) });
}));

app.get("/users/me", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const [joins, submissions, boosts] = await Promise.all([
    prisma.missionJoin.findMany({ where: { userId: user.id }, include: { mission: true } }),
    prisma.submission.findMany({ where: { userId: user.id }, include: { mission: true } }),
    prisma.rewardBoost.findMany({ where: { userId: user.id }, include: { mission: true } }),
  ]);
  res.json({ user: { ...publicUser(user), missionsJoined: joins.length, submissions: submissions.length, boostedMissions: boosts.length, joinedMissionIds: joins.map((join) => join.mission.slug), submittedMissionIds: submissions.map((submission) => submission.mission.slug), boostedMissionIds: boosts.map((boost) => boost.mission.slug) } });
}));

app.patch("/users/me", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { username: req.body.username, avatarUrl: req.body.avatarUrl },
  });
  res.json({ user: publicUser(updated) });
}));

app.get("/missions", asyncRoute(async (req, res) => {
  const missions = await prisma.mission.findMany({
    orderBy: [{ featured: "desc" }, { deadline: "asc" }],
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  res.json({ missions: missions.map(serializeMission) });
}));

app.get("/missions/:id", asyncRoute(async (req, res) => {
  const mission = await prisma.mission.findUnique({
    where: { slug: req.params.id },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  if (!mission) return res.status(404).json({ error: "Mission not found." });
  res.json({ mission: serializeMission(mission) });
}));

app.post("/missions", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: req.body.agentId } });
  const slug = req.body.slug || String(req.body.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const mission = await prisma.mission.create({
    data: {
      slug,
      title: req.body.title,
      category: req.body.category,
      agentId: agent.id,
      createdById: user.id,
      rewardPool: Number(req.body.reward),
      deadline: new Date(req.body.deadline),
      description: req.body.description,
      rules: ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules || "").split("\n").filter(Boolean)),
      proof: req.body.proof,
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  res.status(201).json({ mission: serializeMission(mission) });
}));

app.post("/missions/:id/join", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  await prisma.missionJoin.upsert({
    where: { userId_missionId: { userId: user.id, missionId: mission.id } },
    update: {},
    create: { userId: user.id, missionId: mission.id },
  });
  res.json({ ok: true });
}));

app.post("/missions/:id/boost", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Boost amount must be positive." });
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  const boost = await prisma.$transaction(async (tx) => {
    const created = await tx.rewardBoost.create({ data: { userId: user.id, missionId: mission.id, amount } });
    await tx.mission.update({ where: { id: mission.id }, data: { rewardPool: { increment: amount } } });
    return created;
  });
  res.status(201).json({ boost });
}));

app.post("/missions/:id/submissions", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  if (!user.xVerified || !user.xUserId) return res.status(403).json({ error: "Connect and verify your X account before submitting." });
  const xPostId = extractPostId(req.body.xPostUrl || req.body.x || req.body.proofUrl);
  if (!xPostId) return res.status(400).json({ error: "A valid x.com or twitter.com post link is required." });
  const author = await fetchPostAuthor(xPostId);
  if (author.authorId !== user.xUserId) {
    return res.status(400).json({ error: "This post does not belong to your connected X account." });
  }
  // TODO: Expand this into a stricter entity-level mention check if the X API plan exposes parsed mentions.
  if (!author.text.toLowerCase().includes("@lazyprotocol")) {
    return res.status(400).json({ error: "Submitted X post must tag @LazyProtocol." });
  }
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
      title: req.body.title,
      description: req.body.description,
      proofUrl: req.body.proofUrl || req.body.proof,
      xPostUrl: req.body.xPostUrl || req.body.x,
      mediaUrl: req.body.mediaUrl || req.body.media,
      xPostId,
      xAuthorId: author.authorId,
      xAuthorHandle: author.handle || user.xHandle || "",
    },
  });
  res.status(201).json({ submission });
}));

app.get("/missions/:id/submissions", asyncRoute(async (req, res) => {
  const mission = await prisma.mission.findUniqueOrThrow({ where: { slug: req.params.id } });
  const submissions = await prisma.submission.findMany({
    where: { missionId: mission.id },
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });
  res.json({
    submissions: submissions.map((submission) => ({
      id: submission.id,
      missionId: req.params.id,
      title: submission.title,
      description: submission.description,
      proof: submission.proofUrl,
      x: submission.xPostUrl,
      user: submission.user.username || submission.user.xHandle || submission.user.wallet,
      xHandle: submission.xAuthorHandle,
      status: submission.status,
      created: submission.createdAt.toISOString(),
    })),
  });
}));

app.get("/leaderboard", asyncRoute(async (req, res) => {
  const [humans, agents, countries, missions] = await Promise.all([
    prisma.user.findMany({ orderBy: { leaderboardPts: "desc" }, take: 50 }),
    prisma.agent.findMany({ orderBy: { supporters: "desc" }, take: 50 }),
    prisma.mission.groupBy({ by: ["country"], _count: { country: true }, where: { country: { not: null } }, orderBy: { _count: { country: "desc" } }, take: 50 }),
    prisma.mission.findMany({ orderBy: { rewardPool: "desc" }, take: 50, include: { _count: { select: { submissions: true } }, agent: true } }),
  ]);
  res.json({
    humans: humans.map((u) => [u.username || u.wallet, `${u.leaderboardPts} PTS`, `$${Number(u.rewardsEarned).toLocaleString()}`, `${u.leaderboardPts} PTS`]),
    agents: agents.map((a) => [a.name, `${a.missionsCount} CREATED`, `$${Number(a.rewardsPaid).toLocaleString()} PAID`, `${a.supporters.toLocaleString()} SUPPORTERS`]),
    countries: countries.map((c) => [c.country, `${c._count.country} MISSIONS`, "LIVE SUBMISSIONS", "ACTIVE"]),
    missions: missions.map((m) => ({ label: m.title, meta: `$${Number(m.rewardPool).toLocaleString()}`, detail: `${m._count.submissions} SUBMISSIONS`, score: statusFor(m), href: `/missions/${m.slug}` })),
  });
}));

app.get("/agents", asyncRoute(async (req, res) => {
  const agents = await prisma.agent.findMany({ include: { _count: { select: { missions: true } } }, orderBy: { supporters: "desc" } });
  res.json({ agents: agents.map(serializeAgent) });
}));

app.get("/agents/:id", asyncRoute(async (req, res) => {
  const agent = await prisma.agent.findUnique({ where: { slug: req.params.id }, include: { _count: { select: { missions: true } } } });
  if (!agent) return res.status(404).json({ error: "Agent not found." });
  res.json({ agent: serializeAgent(agent) });
}));

app.post("/auth/x/start", asyncRoute(async (req, res) => {
  const user = await requireUser(req);
  if (!process.env.X_CLIENT_ID || !process.env.X_CALLBACK_URL) return res.status(500).json({ error: "X OAuth is not configured." });
  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  xSessions.set(state, { verifier, wallet: user.wallet, expires: Date.now() + 10 * 60 * 1000 });
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

app.get("/auth/x/callback", asyncRoute(async (req, res) => {
  const session = xSessions.get(String(req.query.state));
  if (!session || session.expires < Date.now()) return res.redirect(`${frontendUrl}/profile?x_error=expired`);
  xSessions.delete(String(req.query.state));
  const xUser = await fetchXUserFromCode(String(req.query.code), session.verifier);
  await prisma.user.update({
    where: { wallet: session.wallet },
    data: {
      xUserId: xUser.id,
      xHandle: xUser.username,
      xDisplayName: xUser.name,
      xProfileImage: xUser.profile_image_url,
      xVerified: true,
    },
  });
  res.redirect(`${frontendUrl}/profile?x_verified=1`);
}));

async function moderateSubmission(req, res, status, type) {
  const admin = await requireAdmin(req);
  const submission = await prisma.submission.update({
    where: { id: req.params.id },
    data: { status, rejectionReason: req.body.reason },
  });
  await prisma.moderationAction.create({ data: { adminUserId: admin.id, type, targetType: "submission", targetId: submission.id, reason: req.body.reason } });
  res.json({ submission });
}

app.post("/submissions/:id/approve", asyncRoute((req, res) => moderateSubmission(req, res, "APPROVED", "SUBMISSION_APPROVED")));
app.post("/submissions/:id/reject", asyncRoute((req, res) => moderateSubmission(req, res, "REJECTED", "SUBMISSION_REJECTED")));
app.post("/submissions/:id/mark-winner", asyncRoute((req, res) => moderateSubmission(req, res, "WINNER", "WINNER_MARKED")));

app.get("/admin", asyncRoute(async (req, res) => {
  await requireAdmin(req);
  const [users, missions, submissions, boosts, agents] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.mission.findMany({ orderBy: { createdAt: "desc" }, include: { agent: true, _count: { select: { joins: true, submissions: true } } } }),
    prisma.submission.findMany({ orderBy: { createdAt: "desc" }, include: { user: true, mission: true } }),
    prisma.rewardBoost.findMany({ orderBy: { createdAt: "desc" }, include: { user: true, mission: true } }),
    prisma.agent.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ users: users.map(publicUser), missions: missions.map(serializeMission), submissions, boosts, agents: agents.map(serializeAgent) });
}));

app.patch("/admin/missions/:id", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const mission = await prisma.mission.update({
    where: { slug: req.params.id },
    data: {
      title: req.body.title,
      description: req.body.description,
      rules: req.body.rules ? ensureRules(Array.isArray(req.body.rules) ? req.body.rules : String(req.body.rules).split("\n").filter(Boolean)) : undefined,
      status: req.body.status,
      featured: req.body.featured,
      deadline: req.body.deadline ? new Date(req.body.deadline) : undefined,
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });
  await prisma.moderationAction.create({ data: { adminUserId: admin.id, type: req.body.featured ? "MISSION_FEATURED" : "MISSION_EDITED", targetType: "mission", targetId: mission.id } });
  res.json({ mission: serializeMission(mission) });
}));

app.post("/admin/agents", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const slug = req.body.slug || String(req.body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const agent = await prisma.agent.create({
    data: {
      slug,
      name: req.body.name,
      handle: req.body.handle,
      avatarUrl: req.body.avatarUrl,
      avatarInitial: req.body.avatarInitial || String(req.body.name).slice(0, 1),
      bio: req.body.bio,
      missionsCount: Number(req.body.missionsCount || 0),
      rewardsPaid: Number(req.body.rewardsPaid || 0),
      supporters: Number(req.body.supporters || 0),
      trustScore: Number(req.body.trustScore || 0),
    },
    include: { _count: { select: { missions: true } } },
  });
  await prisma.moderationAction.create({ data: { adminUserId: admin.id, type: "AGENT_MANAGED", targetType: "agent", targetId: agent.id } });
  res.status(201).json({ agent: serializeAgent(agent) });
}));

app.patch("/admin/agents/:id", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const agent = await prisma.agent.update({
    where: { slug: req.params.id },
    data: {
      name: req.body.name,
      handle: req.body.handle,
      avatarUrl: req.body.avatarUrl,
      avatarInitial: req.body.avatarInitial,
      bio: req.body.bio,
      missionsCount: req.body.missionsCount === undefined ? undefined : Number(req.body.missionsCount),
      rewardsPaid: req.body.rewardsPaid === undefined ? undefined : Number(req.body.rewardsPaid),
      supporters: req.body.supporters === undefined ? undefined : Number(req.body.supporters),
      trustScore: req.body.trustScore === undefined ? undefined : Number(req.body.trustScore),
    },
    include: { _count: { select: { missions: true } } },
  });
  await prisma.moderationAction.create({ data: { adminUserId: admin.id, type: "AGENT_MANAGED", targetType: "agent", targetId: agent.id } });
  res.json({ agent: serializeAgent(agent) });
}));

app.post("/admin/missions/:id/expire", asyncRoute(async (req, res) => {
  const admin = await requireAdmin(req);
  const mission = await prisma.mission.update({ where: { slug: req.params.id }, data: { status: "EXPIRED" }, include: { agent: true, _count: { select: { joins: true, submissions: true } } } });
  await prisma.moderationAction.create({ data: { adminUserId: admin.id, type: "MISSION_EXPIRED", targetType: "mission", targetId: mission.id } });
  res.json({ mission: serializeMission(mission) });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error." });
});

app.listen(port, () => {
  console.log(`Lazy Protocol API listening on ${port}`);
});
