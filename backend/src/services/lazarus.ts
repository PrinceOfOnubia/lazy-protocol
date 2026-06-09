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
    proof: "Public X post URL tagging @lazy_protocol",
  },
  prediction: {
    title: "PREDICT THE MATCHDAY SCORE",
    category: "Predictions",
    description: "Submit one free-to-play matchday score prediction before kickoff.",
    rules: ["One prediction per verified participant.", "No purchase required.", "Points and rewards only.", LAZY_X_RULE],
    proof: "Public X prediction post URL tagging @lazy_protocol",
  },
  poster: {
    title: "DESIGN YOUR COUNTRY'S POSTER",
    category: "Creative",
    description: "Design a bold supporter poster for your country or agent team.",
    rules: ["Use original artwork.", "No hateful or unsafe content.", LAZY_X_RULE],
    proof: "Public X image post URL tagging @lazy_protocol",
  },
  "fan-reaction": {
    title: "RECORD A FAN REACTION",
    category: "World Cup",
    description: "Record a short, safe fan reaction for a matchday moment.",
    rules: ["Keep it under 45 seconds.", "Record in a safe location.", "No harassment.", LAZY_X_RULE],
    proof: "Public X video post URL tagging @lazy_protocol",
  },
  research: {
    title: "FIND 10 AI AGENT PROJECTS",
    category: "Research",
    description: "Find ten active AI agent projects and summarize the useful signal.",
    rules: ["Use public sources.", "Include ten working links.", "Summaries must be your own work.", LAZY_X_RULE],
    proof: "Research doc plus public X summary URL tagging @lazy_protocol",
  },
  awareness: {
    title: "WRITE A LAZY PROTOCOL MATCHDAY THREAD",
    category: "Community",
    description: "Write a short thread explaining how agent-created missions turn attention into productive work.",
    rules: ["Keep it accurate.", "No spam.", "Use your own words.", LAZY_X_RULE],
    proof: "Public X thread URL tagging @lazy_protocol",
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
  rewardCurrency?: "USDC" | "SOL";
  deadlineHours?: number;
  description?: string;
  featured?: boolean;
  adminUserId?: string;
  fundingTxHash?: string;
  funderWallet?: string;
  rewardWallet?: string;
}) {
  const agent = await ensureLazarusAgent();
  const type = (input.type && input.type in templates ? input.type : "world-cup-meme") as LazarusKind;
  const template = templates[type];
  const rewardPool = Number(input.rewardPool || 100);
  const rewardCurrency = input.rewardCurrency === "SOL" ? "SOL" : "USDC";
  if (!Number.isFinite(rewardPool) || rewardPool <= 0) {
    const error = new Error("Reward pool must be positive.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const now = Date.now();
  const deadline = new Date(now + Number(input.deadlineHours || 48) * 3600000);
  const slug = `${slugify(template.title)}-${Math.floor(now / 1000)}`;
  const rules = ensureRules(template.rules);
  const description = String(input.description || template.description).trim();
  validateSafeMission({ ...template, description, rules });

  const mission = await prisma.mission.create({
    data: {
      slug,
      title: template.title,
      category: template.category,
      description,
      rules,
      proof: template.proof,
      rewardPool,
      rewardCurrency,
      prizePoolAmountSol: rewardCurrency === "SOL" ? rewardPool : null,
      fundingTxHash: input.fundingTxHash || null,
      funderWallet: input.funderWallet || null,
      rewardWallet: input.rewardWallet || null,
      fundingStatus: input.fundingTxHash ? "CONFIRMED" : "PENDING",
      deadline,
      featured: Boolean(input.featured),
      agentId: agent.id,
      createdById: input.adminUserId,
      createdByType: "LAZARUS",
      createdByWallet: agent.ownerWallet,
    },
    include: { agent: true, _count: { select: { joins: true, submissions: true } } },
  });

  return serializeMission(mission);
}

export async function lazarusMemorySummary() {
  const [persona, recent] = await Promise.all([
    prisma.lazarusMemory.findUnique({ where: { key: "persona" } }),
    prisma.mission.findMany({
      where: { createdByType: "LAZARUS" },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { title: true, category: true, status: true, createdAt: true },
    }),
  ]);
  return {
    persona: persona?.value || {
      tone: "bold, concise, useful, campaign-native",
      purpose: "Create safe missions that turn human attention into productive onchain work.",
      rules: ["No harmful missions", "No gambling framing", "Require @lazy_protocol X proof when X is used"],
    },
    recentMissions: recent.map((mission) => ({
      title: mission.title,
      category: mission.category,
      status: mission.status,
      createdAt: mission.createdAt.toISOString(),
    })),
  };
}

export function lazarusAiStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    memory: "persona + recent Lazarus missions",
  };
}

export async function generateLazarusDescription(type?: string) {
  const selectedType = (type && type in templates ? type : "world-cup-meme") as LazarusKind;
  const template = templates[selectedType];
  const memory = await lazarusMemorySummary();
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("Lazarus AI generation is unavailable until server-side AI credentials are added.");
    (error as Error & { status?: number }).status = 503;
    throw error;
  }
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        { role: "system", content: "You are Lazarus, Lazy Protocol's native mission agent. Write safe, concise, high-energy mission descriptions. Never include unsafe stunts, illegal activity, gambling framing, secrets, or private user data." },
        { role: "user", content: JSON.stringify({ template, memory, instruction: "Write one mission description under 38 words. Make it actionable, safe, and on-brand." }) },
      ],
      temperature: 0.7,
      max_tokens: 90,
    }),
  });
  if (!response.ok) {
    const error = new Error("Lazarus AI generation failed. Try again or write the description manually.");
    (error as Error & { status?: number }).status = 502;
    throw error;
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || template.description;
}
