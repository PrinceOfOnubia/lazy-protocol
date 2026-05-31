CREATE TYPE "MissionStatus" AS ENUM ('OPEN', 'ENDING_SOON', 'EXPIRED', 'COMPLETED');
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WINNER');
CREATE TYPE "LeaderboardKind" AS ENUM ('HUMAN', 'AGENT', 'COUNTRY', 'MISSION');
CREATE TYPE "AdminActionType" AS ENUM ('MISSION_CREATED', 'MISSION_EDITED', 'MISSION_EXPIRED', 'SUBMISSION_APPROVED', 'SUBMISSION_REJECTED', 'WINNER_MARKED', 'AGENT_MANAGED');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "username" TEXT,
  "avatarUrl" TEXT,
  "rewardsEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "chain" TEXT NOT NULL DEFAULT 'solana',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "x_accounts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "xUserId" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "displayName" TEXT,
  "profileImage" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "x_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agents" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "handle" TEXT,
  "avatarUrl" TEXT,
  "avatarInitial" TEXT,
  "bio" TEXT NOT NULL,
  "missionsCount" INTEGER NOT NULL DEFAULT 0,
  "rewardsPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "supporters" INTEGER NOT NULL DEFAULT 0,
  "trustScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "missions" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "rules" TEXT[],
  "proof" TEXT NOT NULL,
  "rewardPool" DECIMAL(12,2) NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "status" "MissionStatus" NOT NULL DEFAULT 'OPEN',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "country" TEXT,
  "agentId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mission_joins" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mission_joins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "submissions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "proofUrl" TEXT NOT NULL,
  "xPostUrl" TEXT NOT NULL,
  "mediaUrl" TEXT,
  "xPostId" TEXT NOT NULL,
  "xAuthorId" TEXT NOT NULL,
  "xAuthorHandle" TEXT NOT NULL,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reward_boosts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "txSignature" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_boosts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leaderboard_points" (
  "id" TEXT NOT NULL,
  "kind" "LeaderboardKind" NOT NULL,
  "points" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "userId" TEXT,
  "missionId" TEXT,
  "country" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leaderboard_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_actions" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT,
  "type" "AdminActionType" NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wallet_accounts_address_key" ON "wallet_accounts"("address");
CREATE UNIQUE INDEX "x_accounts_xUserId_key" ON "x_accounts"("xUserId");
CREATE UNIQUE INDEX "agents_slug_key" ON "agents"("slug");
CREATE UNIQUE INDEX "missions_slug_key" ON "missions"("slug");
CREATE UNIQUE INDEX "mission_joins_userId_missionId_key" ON "mission_joins"("userId", "missionId");

ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "x_accounts" ADD CONSTRAINT "x_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mission_joins" ADD CONSTRAINT "mission_joins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mission_joins" ADD CONSTRAINT "mission_joins_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward_boosts" ADD CONSTRAINT "reward_boosts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward_boosts" ADD CONSTRAINT "reward_boosts_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_points" ADD CONSTRAINT "leaderboard_points_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leaderboard_points" ADD CONSTRAINT "leaderboard_points_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
