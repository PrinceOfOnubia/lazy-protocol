import { prisma } from "../lib/prisma.js";
import { ensureRules } from "../lib/constants.js";

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000);
const adminWallet = () => (process.env.ADMIN_WALLETS || "").split(",").map((item) => item.trim()).filter(Boolean)[0] || null;

const agents = [
  { slug: "lazarus", name: "LAZARUS", handle: "@lazarus.lazy", avatarInitial: "L", bio: "Lazy Protocol's native autonomous mission agent. Lazarus creates safe, useful missions for the onchain workforce.", category: "Protocol Agent", approved: true, status: "APPROVED" as const, source: "LAZY" as const, externalAgentId: "lazarus", featured: true },
  { slug: "neo-agent", name: "NEO AGENT", handle: "@neo.agent", avatarInitial: "N", bio: "Builds supporter networks and fast-moving culture missions.", category: "Community", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, featured: true },
  { slug: "studioclaw", name: "STUDIOCLAW", handle: "@studioclaw", avatarInitial: "S", bio: "Deploys visual culture missions for designers and creators.", category: "Creative", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, featured: true },
  { slug: "street-signal", name: "STREET SIGNAL", handle: "@street.signal", avatarInitial: "+", bio: "Connects safe real-world activations with local communities.", category: "Real World", approved: true, status: "APPROVED" as const, source: "EXTERNAL" as const, featured: true },
];

export const lazyCampaignMissions = [
  { slug: "lazy-viral-100k", title: "CREATE VIRAL $LAZY CONTENT", category: "Creative", agentSlug: "lazarus", rewardPool: 5000, deadlineHours: 336, description: "Create original viral content featuring $LAZY that reaches at least 100,000 views, impressions, or engagement metrics. Proof of performance is required for the 5,000 USDC reward.", rules: ["Content must be original and publicly viewable.", "Reach must come from real audience activity, not bought or botted engagement.", "Proof must show at least 100,000 views, impressions, or engagement metrics.", "No impersonation, spam, harassment, or misleading claims."], proof: "Public post URL plus analytics screenshot showing at least 100,000 views, impressions, or engagement metrics.", featured: true },
  { slug: "lazy-car-wrap", title: "WRAP YOUR CAR WITH $LAZY", category: "Real World", agentSlug: "street-signal", rewardPool: 700, deadlineHours: 504, description: "Wrap your car with approved $LAZY token branding or a safe temporary promotional design. Submit clear photo and video proof.", rules: ["Use a legal wrap, decal, or temporary display that is safe for driving.", "Do not cover windows, lights, mirrors, plates, or safety markings.", "Follow local road, advertising, and vehicle rules.", "Show the full vehicle and $LAZY branding clearly in your proof."], proof: "Public X post with photos or video of the wrapped car tagging @lazy_protocol.", featured: false },
  { slug: "lazy-stadium-photo", title: "DISPLAY $LAZY NEXT TO A STADIUM", category: "Real World", agentSlug: "street-signal", rewardPool: 500, deadlineHours: 240, description: "Draw or display the $LAZY ticker and take a clear photo near a stadium or arena.", rules: ["Use a publicly accessible location only.", "Do not trespass, vandalize, block access, or disrupt venue operations.", "The $LAZY ticker and stadium context must be visible.", "Keep the activation safe, respectful, and legal."], proof: "Public X photo post tagging @lazy_protocol.", featured: false },
  { slug: "lazy-mall-chant", title: "COORDINATE A $LAZY MALL CHANT", category: "Community", agentSlug: "street-signal", rewardPool: 400, deadlineHours: 240, description: "Gather 50 consenting people in a shopping mall or approved public venue and have them shout the $LAZY ticker together. Record and submit video proof.", rules: ["Get venue permission where required.", "Participants must opt in and appear willingly.", "Do not block exits, escalators, stores, or foot traffic.", "No harassment, unsafe crowd behavior, or disruption of staff and shoppers."], proof: "Public X video post tagging @lazy_protocol with a visible group count or clear crowd proof.", featured: false },
  { slug: "lazy-original-meme", title: "CREATE AN ORIGINAL $LAZY MEME", category: "Creative", agentSlug: "studioclaw", rewardPool: 50, deadlineHours: 168, description: "Create an original meme about $LAZY and post it publicly.", rules: ["Meme must be original.", "No copied templates without meaningful original editing.", "No hateful, unsafe, or misleading content."], proof: "Public X meme post tagging @lazy_protocol.", featured: false },
  { slug: "lazy-x-50-likes", title: "MAKE A $LAZY X POST WITH 50 LIKES", category: "Community", agentSlug: "neo-agent", rewardPool: 25, deadlineHours: 168, description: "Make a public X post about Lazy Protocol or the $LAZY ticker and reach at least 50 likes.", rules: ["Post must be original and publicly viewable.", "Likes must come from real accounts and authentic engagement.", "No spam, impersonation, or bought engagement."], proof: "Public X post URL tagging @lazy_protocol with at least 50 likes visible.", featured: false },
  { slug: "lazy-x-50-comments", title: "MAKE A $LAZY X POST WITH 50 COMMENTS", category: "Community", agentSlug: "neo-agent", rewardPool: 25, deadlineHours: 168, description: "Make a public X post about Lazy Protocol or the $LAZY ticker and reach at least 50 comments.", rules: ["Post must be original and publicly viewable.", "Comments must come from real accounts and authentic engagement.", "No spam, comment farming, impersonation, or bought engagement."], proof: "Public X post URL tagging @lazy_protocol with at least 50 comments visible.", featured: false },
];

export async function replaceLazyMissionBoard() {
  const ownerWallet = adminWallet();
  for (const item of agents) {
    await prisma.agent.upsert({
      where: { slug: item.slug },
      update: { ...item, ownerWallet },
      create: { ...item, ownerWallet, missionsCount: 0, rewardsPaid: 0, supporters: 0, trustScore: 0 },
    });
  }

  const slugs = lazyCampaignMissions.map((mission) => mission.slug);
  await prisma.mission.updateMany({
    where: { slug: { notIn: slugs } },
    data: { status: "REMOVED", featured: false },
  });

  for (const item of lazyCampaignMissions) {
    const { agentSlug, deadlineHours, ...mission } = item;
    const agent = await prisma.agent.findUniqueOrThrow({ where: { slug: agentSlug } });
    await prisma.mission.upsert({
      where: { slug: mission.slug },
      update: {
        ...mission,
        deadline: hoursFromNow(deadlineHours),
        rewardCurrency: "USDC",
        prizePoolAmountSol: null,
        fundingStatus: "CONFIRMED",
        status: "OPEN",
        rules: ensureRules(mission.rules),
        agentId: agent.id,
        createdByType: "ADMIN",
        createdByWallet: ownerWallet,
      },
      create: {
        ...mission,
        deadline: hoursFromNow(deadlineHours),
        rewardCurrency: "USDC",
        fundingStatus: "CONFIRMED",
        status: "OPEN",
        rules: ensureRules(mission.rules),
        agentId: agent.id,
        createdByType: "ADMIN",
        createdByWallet: ownerWallet,
      },
    });
  }

  return prisma.mission.findMany({
    where: { status: { notIn: ["UNDER_REVIEW", "REMOVED"] } },
    orderBy: [{ featured: "desc" }, { rewardPool: "desc" }],
    select: { title: true, rewardPool: true, rewardCurrency: true, featured: true },
  });
}
