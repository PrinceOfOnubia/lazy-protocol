CREATE TYPE "MissionStatus" AS ENUM ('OPEN', 'ENDING_SOON', 'EXPIRED', 'COMPLETED');
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WINNER');
CREATE TYPE "ModerationActionType" AS ENUM ('MISSION_CREATED', 'MISSION_EDITED', 'MISSION_EXPIRED', 'SUBMISSION_APPROVED', 'SUBMISSION_REJECTED', 'WINNER_MARKED', 'MISSION_FEATURED', 'AGENT_MANAGED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "wallet" TEXT NOT NULL,
  "username" TEXT,
  "avatarUrl" TEXT,
  "xUserId" TEXT,
  "xHandle" TEXT,
  "xDisplayName" TEXT,
  "xProfileImage" TEXT,
  "xVerified" BOOLEAN NOT NULL DEFAULT false,
  "rewardsEarned" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "leaderboardPts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Agent" (
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
  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mission" (
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
  CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MissionJoin" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissionJoin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Submission" (
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
  CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardBoost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "txSignature" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardBoost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModerationAction" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT,
  "type" "ModerationActionType" NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_wallet_key" ON "User"("wallet");
CREATE UNIQUE INDEX "User_xUserId_key" ON "User"("xUserId");
CREATE UNIQUE INDEX "Agent_slug_key" ON "Agent"("slug");
CREATE UNIQUE INDEX "Mission_slug_key" ON "Mission"("slug");
CREATE UNIQUE INDEX "MissionJoin_userId_missionId_key" ON "MissionJoin"("userId", "missionId");

ALTER TABLE "Mission" ADD CONSTRAINT "Mission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionJoin" ADD CONSTRAINT "MissionJoin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionJoin" ADD CONSTRAINT "MissionJoin_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardBoost" ADD CONSTRAINT "RewardBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardBoost" ADD CONSTRAINT "RewardBoost_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
