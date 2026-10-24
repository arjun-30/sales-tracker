-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('in_person', 'phone');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('pending', 'approved');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "channel" "OrderChannel" NOT NULL DEFAULT 'in_person',
ADD COLUMN     "distanceFromStoreM" INTEGER,
ADD COLUMN     "storeId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "status" "StoreStatus" NOT NULL DEFAULT 'approved';

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
