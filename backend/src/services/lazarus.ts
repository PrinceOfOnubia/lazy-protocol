import { prisma } from "../lib/prisma.js";
import { ensureRules, LAZY_X_RULE, slugify } from "../lib/constants.js";
import { serializeMission } from "../lib/serializers.js";
import { validateSafeMission } from "../lib/safety.js";

type LazarusKind = "world-cup-meme" | "prediction" | "poster" | "fan-reaction" | "research" | "awareness";

const templates: Record<LazarusKind, {
  title: string;
  category: string;
  description: string;
  rules: string[];
  proof: string;
}> = {
  "world-cup-meme": {
    title: "CREATE A WORLD CUP MEME",
    category: "World Cup",
    description: "Create an original, shareable football meme for the active World Cup campaign.",
    rules: ["Keep it original.", "Keep it supporter-friendly.", LAZY_X_RULE],
    proof: "Public X post URL tagging @LazyProtocol",
  },
  prediction: {
    title: "PREDICT THE MATCHDAY SCORE",
    category: "Predictions",
    description: "Submit one free-to-play matchday score prediction before kickoff.",
    rules: ["One prediction per verified participant.", "No purchase required.", "Points and rewards only.", LAZY_X_RULE],
    proof: "Public X prediction post URL tagging @LazyProtocol",
  },
  poster: {
    title: "DESIGN YOUR COUNTRY'S POSTER",
    category: "Creative",
    description: "Design a bold supporter poster for your country or agent team.",
    rules: ["Use original artwork.", "No hateful or unsafe content.", LAZY_X_RULE],
    proof: "Public X image post URL tagging @LazyProtocol",
  },
  "fan-reaction": {
    title: "RECORD A FAN REACTION",
    category: "World Cup",
    description: "Record a short, safe fan reaction for a matchday moment.",
    rules: ["Keep it under 45 seconds.", "Record in a safe location.", "No harassment.", LAZY_X_RULE],
    proof: "Public X video post URL tagging @LazyProtocol",
  },
  research: {
    title: "FIND 10 AI AGENT PROJECTS",
    category: "Research",
    description: "Find ten active AI agent projects and summarize the useful signal.",
    rules: ["Use public sources.", "Include ten working links.", "Summaries must be your own work.", LAZY_X_RULE],
    proof: "Research doc plus public X summary URL tagging @LazyProtocol",
  },
  awareness: {
    title: "WRITE A LAZY PROTOCOL MATCHDAY THREAD",
    category: "Community",
    description: "Write a short thread explaining how agent-created missions turn attention into productive work.",
    rules: ["Keep it accurate.", "No spam.", "Use your own words.", LAZY_X_RULE],
    proof: "Public X thread URL tagging @LazyProtocol",
  },
};

export function lazarusMissionTemplates() {
  return Object.entries(templates).map(([id, template]) => ({ id, ...template }));
}

export async function ensureLazarusAgent() {
  const ownerWallet = (process.env.ADMIN_WALLETS || "").split(",").map((item) => item.trim()).filter(Boolean)[0] || null;
  return prisma.agent.upsert({
    where: { slug: "lazarus" },
    update: {
      name: "LAZARUS",
      handle: "@lazarus.lazy",
      category: "Protocol Agent",
      source: "LAZY",
      status: "APPROVED",
      approved: true,
      featured: true,
      ownerWallet,
    },
    create: {
      slug: "lazarus",
      name: "LAZARUS",
      handle: "@lazarus.lazy",
      avatarInitial: "L",
      bio: "Lazy Protocol's native autonomous mission agent. Lazarus creates safe, useful missions for the onchain workforce.",
      category: "Protocol Agent",
      ownerWallet,
      approved: true,
      status: "APPROVED",
      source: "LAZY",
      externalAgentId: "lazarus",
      featured: true,
    },
  });
}

export async function createLazarusMission(input: {
  type?: string;
  rewardPool?: number;
  deadlineHours?: number;
  featured?: boolean;
  adminUserId?: string;
}) {
  const agent = await ensureLazarusAgent();
  const type = (input.type && input.type in templates ? input.type : "world-cup-meme") as LazarusKind;
  const template = templates[type];
  const rewardPool = Number(input.rewardPool || 100);
  if (!Number.isFinite(rewardPool) || rewardPool <= 0) {
    const error = new Error("Reward pool must be positive.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const now = Date.now();
  const deadline = new Date(now + Number(input.deadlineHours || 48) * 3600000);
  const slug = `${slugify(template.title)}-${Math.floor(now / 1000)}`;
  const rules = ensureRules(template.rules);
  validateSafeMission({ ...template, rules });

  const mission = await prisma.mission.create({
    data: {
      slug,
      title: template.title,
      category: template.category,
      description: template.description,
      rules,
      proof: template.proof,
      rewardPool,
      deadline,
      featured: Boolean(input.featured),
      agentId: agent.id,
      createdById: input.adminUserId,
      createdByType: "LAZARUS",
      createdByWallet: agent.ownerWallet,
      fundingStatus: "PENDING",
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });

  return serializeMission(mission);
}
