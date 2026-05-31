DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FundingTransactionType') THEN
    CREATE TYPE "FundingTransactionType" AS ENUM ('MISSION_FUND', 'BOOST');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FundingStatus') THEN
    CREATE TYPE "FundingStatus" AS ENUM ('PENDING', 'FUNDED', 'CONFIRMED', 'FAILED');
  END IF;
END $$;

ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Agents';
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "ownerWallet" TEXT;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "featured" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "prizePoolAmountSol" DECIMAL(18,9);
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "fundingTxHash" TEXT;
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "funderWallet" TEXT;
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "rewardWallet" TEXT;
ALTER TABLE "missions" ADD COLUMN IF NOT EXISTS "fundingStatus" "FundingStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "reward_boosts" ADD COLUMN IF NOT EXISTS "amountSol" DECIMAL(18,9);
ALTER TABLE "reward_boosts" ADD COLUMN IF NOT EXISTS "boosterWallet" TEXT;
ALTER TABLE "reward_boosts" ADD COLUMN IF NOT EXISTS "status" "FundingStatus" NOT NULL DEFAULT 'PENDING';

CREATE TABLE IF NOT EXISTS "funding_transactions" (
  "id" TEXT NOT NULL,
  "txHash" TEXT NOT NULL,
  "type" "FundingTransactionType" NOT NULL,
  "missionId" TEXT,
  "fromWallet" TEXT NOT NULL,
  "toWallet" TEXT NOT NULL,
  "amountSol" DECIMAL(18,9) NOT NULL,
  "status" "FundingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "funding_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "funding_transactions_txHash_key" ON "funding_transactions"("txHash");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funding_transactions_missionId_fkey') THEN
    ALTER TABLE "funding_transactions" ADD CONSTRAINT "funding_transactions_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
