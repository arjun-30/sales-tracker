-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "gstinName" TEXT,
ADD COLUMN     "gstinStatus" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "gstinCheckedAt" TIMESTAMP(3),
ADD COLUMN     "gstinName" TEXT,
ADD COLUMN     "gstinStatus" TEXT;

-- CreateTable
CREATE TABLE "GstinCheck" (
    "gstin" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "status" TEXT,
    "legalName" TEXT,
    "tradeName" TEXT,
    "address" TEXT,
    "state" TEXT,
    "registeredOn" TEXT,
    "cancelledOn" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstinCheck_pkey" PRIMARY KEY ("gstin")
);
