-- AlterTable
ALTER TABLE "EmployeeLocation" ADD COLUMN     "anchorLat" DOUBLE PRECISION,
ADD COLUMN     "anchorLng" DOUBLE PRECISION,
ADD COLUMN     "stationarySince" TIMESTAMP(3);
