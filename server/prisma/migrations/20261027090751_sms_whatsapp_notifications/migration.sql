-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'failed', 'logged');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "storeId" TEXT;

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "error" TEXT,
    "plantId" TEXT,
    "orderId" TEXT,
    "visitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_userId_createdAt_idx" ON "PhoneOtp"("phone", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_plantId_createdAt_idx" ON "OutboundMessage"("plantId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_kind_createdAt_idx" ON "OutboundMessage"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
