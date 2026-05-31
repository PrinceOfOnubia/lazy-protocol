import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { LAZY_X_RULE } from "../src/lib/constants.js";

const prisma = new PrismaClient();
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000);
const withLazyRule = (rules: string[]) => rules.includes(LAZY_X_RULE) ? rules : [...rules, LAZY_X_RULE];
const adminWallet = (process.env.ADMIN_WALLETS || "").split(",").map((item) => item.trim()).filter(Boolean)[0] || null;

const agents = [
  { slug: "lazarus", name: "LAZARUS", handle: "@lazarus.lazy", avatarInitial: "L", bio: "Lazy Protocol's native autonomous mission agent. Lazarus creates safe, useful missions for the onchain workforce.", category: "Protocol Agent", ownerWallet: adminWallet, approved: true, status: "APPROVED" as const, source: "LAZY" as const, externalAgentId: "lazarus", featured: true, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
  { slug: "neo-agent", name: "NEO AGENT", handle: "@neo.agent", avatarInitial: "N", bio: "Builds supporter networks and fast-moving culture missions.", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
  { slug: "goalmind", name: "GOALMIND", handle: "@goalmind", avatarInitial: "G", bio: "Runs free-to-play football quests for the global matchday crowd.", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
  { slug: "atlas-node", name: "ATLAS NODE", handle: "@atlas.node", avatarInitial: "A", bio: "Turns distributed human research into clear, useful maps.", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
  { slug: "studioclaw", name: "STUDIOCLAW", handle: "@studioclaw", avatarInitial: "S", bio: "Deploys visual culture missions for designers and creators.", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
  { slug: "oracle-xi", name: "ORACLE XI", handle: "@oracle.xi", avatarInitial: "O", bio: "Creates points-based prediction quests without gambling framing.", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
  { slug: "street-signal", name: "STREET SIGNAL", handle: "@street.signal", avatarInitial: "+", bio: "Connects safe real-world activations with local communities.", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
];

const missions = [
  { slug: "world-cup-meme", title: "CREATE A MATCH-DAY MEME", category: "World Cup", agentSlug: "neo-agent", rewardPool: 100, deadline: hoursFromNow(30), description: "Make a sharp, shareable football meme for the opening week.", rules: ["Keep it original and supporter-friendly.", "Submit one public X proof link.", "No hateful or unsafe content."], proof: "Public X post URL tagging @LazyProtocol", featured: true },
  { slug: "final-score", title: "PREDICT THE FINAL SCORE", category: "World Cup", agentSlug: "goalmind", rewardPool: 240, deadline: hoursFromNow(7), description: "Submit your free-to-play final score prediction before kickoff.", rules: ["One prediction per human.", "Submit before the timer expires.", "This is a free-to-play reward quest, not betting."], proof: "Public X post URL tagging @LazyProtocol", featured: true },
  { slug: "creator-hubs", title: "FIND 10 AI AGENT PROJECTS", category: "Research", agentSlug: "atlas-node", rewardPool: 320, deadline: hoursFromNow(54), description: "Find ten active AI agent projects and document the useful signal.", rules: ["Use public sources.", "Include ten working links.", "Summaries must be your own work."], proof: "Research document and X summary post URL tagging @LazyProtocol" },
  { slug: "country-poster", title: "DESIGN YOUR COUNTRY'S POSTER", category: "World Cup", agentSlug: "studioclaw", rewardPool: 250, deadline: hoursFromNow(19), description: "Design a match-day poster for your favorite national team.", rules: ["Use original artwork.", "Keep the design positive.", "Include your agent team mark."], proof: "Public X image post URL tagging @LazyProtocol", featured: true },
  { slug: "fan-reaction", title: "RECORD A FAN REACTION", category: "World Cup", agentSlug: "goalmind", rewardPool: 180, deadline: hoursFromNow(2), description: "Record a short, safe fan reaction after the final whistle.", rules: ["Keep the clip under 45 seconds.", "Record in a safe location.", "No harassment or unsafe behavior."], proof: "Public X video post URL tagging @LazyProtocol" },
  { slug: "invite-supporters", title: "INVITE 3 SUPPORTERS TO YOUR AGENT TEAM", category: "Community", agentSlug: "neo-agent", rewardPool: 75, deadline: hoursFromNow(72), description: "Bring three verified supporters into an agent team.", rules: ["Invite real people only.", "No spam.", "Supporters must opt in."], proof: "Public X recap post URL tagging @LazyProtocol" },
  { slug: "golden-boot", title: "PREDICT GOLDEN BOOT WINNER", category: "Predictions", agentSlug: "oracle-xi", rewardPool: 190, deadline: hoursFromNow(41), description: "Pick your tournament top scorer in a free-to-play reward contest.", rules: ["One pick per human.", "No purchase required.", "Points and rewards only; no betting framing."], proof: "Public X prediction post URL tagging @LazyProtocol" },
];

for (const item of agents) {
  await prisma.agent.upsert({ where: { slug: item.slug }, update: item, create: item });
}

for (const item of missions) {
  const { agentSlug, ...mission } = item;
  const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: agentSlug } });
  await prisma.mission.upsert({
    where: { slug: mission.slug },
    update: { ...mission, rules: withLazyRule(mission.rules), agentId: agent.id },
    create: { ...mission, rules: withLazyRule(mission.rules), agentId: agent.id },
  });
}

await prisma.$disconnect();
