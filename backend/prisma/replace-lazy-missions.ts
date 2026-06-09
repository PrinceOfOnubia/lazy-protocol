import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { replaceLazyMissionBoard } from "../src/services/lazy-mission-board.js";

const active = await replaceLazyMissionBoard();

console.log(`Replaced mission board with ${active.length} active $LAZY missions.`);
for (const mission of active) {
  console.log(`${mission.featured ? "*" : "-"} ${mission.rewardPool.toString()} ${mission.rewardCurrency} — ${mission.title}`);
}

await prisma.$disconnect();
