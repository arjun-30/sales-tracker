-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'upi', 'cheque', 'bank_transfer', 'credit');

-- AlterEnum
ALTER TYPE "DutyEndReason" ADD VALUE 'day_end';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'dispatched';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryNote" TEXT,
ADD COLUMN     "dispatchedAt" TIMESTAMP(3),
ADD COLUMN     "driverName" TEXT,
ADD COLUMN     "driverPhone" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "vehicleNo" TEXT,
ADD COLUMN     "visitId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "shadeId" TEXT,
ADD COLUMN     "shadeName" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "nextVisitOn" DATE;

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN     "nextVisitOn" DATE,
ADD COLUMN     "notifyOwner" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentAmount" DECIMAL(12,2),
ADD COLUMN     "paymentMode" "PaymentMode",
ADD COLUMN     "paymentRef" TEXT;

-- CreateTable
CREATE TABLE "ProductShade" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "hex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductShade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDeliveryProof" (
    "orderId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDeliveryProof_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductShade_productId_name_key" ON "ProductShade"("productId", "name");

-- AddForeignKey
ALTER TABLE "ProductShade" ADD CONSTRAINT "ProductShade_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_shadeId_fkey" FOREIGN KEY ("shadeId") REFERENCES "ProductShade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDeliveryProof" ADD CONSTRAINT "OrderDeliveryProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
