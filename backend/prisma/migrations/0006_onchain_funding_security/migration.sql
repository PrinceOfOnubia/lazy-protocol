ALTER TABLE "funding_transactions" ADD COLUMN IF NOT EXISTS "boostId" TEXT;
ALTER TABLE "funding_transactions" ADD COLUMN IF NOT EXISTS "currency" "RewardCurrency" NOT NULL DEFAULT 'SOL';
ALTER TABLE "funding_transactions" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(18, 9) NOT NULL DEFAULT 0;
ALTER TABLE "funding_transactions" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
UPDATE "funding_transactions" SET "amount" = "amountSol" WHERE "amount" = 0;
UPDATE "funding_transactions" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL AND "status" = 'CONFIRMED';
DO $$ BEGIN
  ALTER TABLE "funding_transactions" ADD CONSTRAINT "funding_transactions_boostId_fkey" FOREIGN KEY ("boostId") REFERENCES "reward_boosts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
CREATE INDEX IF NOT EXISTS "funding_transactions_boostId_idx" ON "funding_transactions"("boostId");
