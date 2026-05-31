DO $$ BEGIN
  CREATE TYPE "RewardCurrency" AS ENUM ('USDC', 'SOL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "rewardCurrency" "RewardCurrency" NOT NULL DEFAULT 'USDC';
ALTER TABLE "reward_boosts" ADD COLUMN IF NOT EXISTS "currency" "RewardCurrency" NOT NULL DEFAULT 'USDC';
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "payoutCurrency" "RewardCurrency" NOT NULL DEFAULT 'USDC';
ALTER TABLE "missions" ALTER COLUMN "rewardPool" TYPE DECIMAL(18, 9);
ALTER TABLE "reward_boosts" ALTER COLUMN "amount" TYPE DECIMAL(18, 9);
ALTER TABLE "submissions" ALTER COLUMN "payoutAmount" TYPE DECIMAL(18, 9);

CREATE TABLE IF NOT EXISTS "lazarus_memory" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lazarus_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "lazarus_memory_key_key" ON "lazarus_memory"("key");
