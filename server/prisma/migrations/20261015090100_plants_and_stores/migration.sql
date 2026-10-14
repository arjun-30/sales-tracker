-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantPrice" (
    "plantId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantPrice_pkey" PRIMARY KEY ("plantId","variantId")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plant_name_key" ON "Plant"("name");
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");
CREATE INDEX "Store_plantId_idx" ON "Store"("plantId");

-- AlterTable
ALTER TABLE "User" ADD COLUMN "plantId" TEXT;
ALTER TABLE "Order" ADD COLUMN "plantId" TEXT;
ALTER TABLE "Visit" ADD COLUMN "plantId" TEXT;

-- Backfill: a database that already has people in it gets one "Main Plant"
-- (rename it and its code from the admin panel). Salespeople and their orders
-- and visits move into it, codes RLX001 become RLX-MAIN-001, and the existing
-- admins become super admins.
INSERT INTO "Plant" ("id", "name", "code", "updatedAt")
SELECT 'plant_main', 'Main Plant', 'MAIN', CURRENT_TIMESTAMP
 WHERE EXISTS (SELECT 1 FROM "User");

UPDATE "User" SET "plantId" = 'plant_main' WHERE role = 'sales_employee';
UPDATE "User" SET role = 'super_admin' WHERE role = 'admin';
UPDATE "User"
   SET "employeeCode" = 'RLX-MAIN-' || substring("employeeCode" FROM 4)
 WHERE "employeeCode" ~ '^RLX[0-9]+$';
UPDATE "Order" SET "plantId" = 'plant_main';
UPDATE "Visit" SET "plantId" = 'plant_main';

ALTER TABLE "Order" ALTER COLUMN "plantId" SET NOT NULL;
ALTER TABLE "Visit" ALTER COLUMN "plantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Order_plantId_createdAt_idx" ON "Order"("plantId", "createdAt");
CREATE INDEX "Visit_plantId_checkInAt_idx" ON "Visit"("plantId", "checkInAt");

-- AddForeignKey
ALTER TABLE "PlantPrice" ADD CONSTRAINT "PlantPrice_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlantPrice" ADD CONSTRAINT "PlantPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Store" ADD CONSTRAINT "Store_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Store" ADD CONSTRAINT "Store_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
