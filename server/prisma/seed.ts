import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const TN_DISTRICTS: { name: string; centerLat: number; centerLng: number }[] = [
  { name: "Ariyalur", centerLat: 11.1401, centerLng: 79.0782 },
  { name: "Chengalpattu", centerLat: 12.6819, centerLng: 79.9888 },
  { name: "Chennai", centerLat: 13.0827, centerLng: 80.2707 },
  { name: "Coimbatore", centerLat: 11.0168, centerLng: 76.9558 },
  { name: "Cuddalore", centerLat: 11.748, centerLng: 79.7714 },
  { name: "Dharmapuri", centerLat: 12.1211, centerLng: 78.1582 },
  { name: "Dindigul", centerLat: 10.3673, centerLng: 77.9803 },
  { name: "Erode", centerLat: 11.341, centerLng: 77.7172 },
  { name: "Kallakurichi", centerLat: 11.7401, centerLng: 78.9597 },
  { name: "Kanchipuram", centerLat: 12.8342, centerLng: 79.7036 },
  { name: "Kanyakumari", centerLat: 8.0883, centerLng: 77.5385 },
  { name: "Karur", centerLat: 10.9601, centerLng: 78.0766 },
  { name: "Krishnagiri", centerLat: 12.5266, centerLng: 78.215 },
  { name: "Madurai", centerLat: 9.9252, centerLng: 78.1198 },
  { name: "Mayiladuthurai", centerLat: 11.1085, centerLng: 79.6538 },
  { name: "Nagapattinam", centerLat: 10.7672, centerLng: 79.8449 },
  { name: "Namakkal", centerLat: 11.2189, centerLng: 78.1674 },
  { name: "Nilgiris", centerLat: 11.4064, centerLng: 76.6932 },
  { name: "Perambalur", centerLat: 11.2342, centerLng: 78.8807 },
  { name: "Pudukkottai", centerLat: 10.3813, centerLng: 78.8213 },
  { name: "Ramanathapuram", centerLat: 9.3639, centerLng: 78.8395 },
  { name: "Ranipet", centerLat: 12.9249, centerLng: 79.3308 },
  { name: "Salem", centerLat: 11.6643, centerLng: 78.146 },
  { name: "Sivaganga", centerLat: 9.8433, centerLng: 78.4809 },
  { name: "Tenkasi", centerLat: 8.9598, centerLng: 77.3152 },
  { name: "Thanjavur", centerLat: 10.787, centerLng: 79.1378 },
  { name: "Theni", centerLat: 10.0104, centerLng: 77.4768 },
  { name: "Thoothukudi", centerLat: 8.7642, centerLng: 78.1348 },
  { name: "Tiruchirappalli", centerLat: 10.7905, centerLng: 78.7047 },
  { name: "Tirunelveli", centerLat: 8.7139, centerLng: 77.7567 },
  { name: "Tirupathur", centerLat: 12.495, centerLng: 78.5678 },
  { name: "Tiruppur", centerLat: 11.1085, centerLng: 77.3411 },
  { name: "Tiruvallur", centerLat: 13.1231, centerLng: 79.912 },
  { name: "Tiruvannamalai", centerLat: 12.2253, centerLng: 79.0747 },
  { name: "Tiruvarur", centerLat: 10.7661, centerLng: 79.6345 },
  { name: "Vellore", centerLat: 12.9165, centerLng: 79.1325 },
  { name: "Viluppuram", centerLat: 11.9401, centerLng: 79.4861 },
  { name: "Virudhunagar", centerLat: 9.5851, centerLng: 77.9624 },
];

async function main() {
  for (const d of TN_DISTRICTS) {
    await prisma.district.upsert({
      where: { name: d.name },
      update: {},
      create: d,
    });
  }
  console.log(`Seeded ${TN_DISTRICTS.length} TN districts`);

  const chennai = await prisma.district.findUniqueOrThrow({ where: { name: "Chennai" } });

  const adminPhone = process.env.SEED_ADMIN_PHONE ?? "9999999999";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      name: "Admin",
      phone: adminPhone,
      passwordHash: adminPasswordHash,
      role: "admin",
      districtId: chennai.id,
    },
  });
  console.log(`Seeded admin user (phone: ${adminPhone}, password: ${adminPassword})`);

  const testEmpPhone = "9000000001";
  const testEmpPasswordHash = await bcrypt.hash("employee123", 10);
  await prisma.user.upsert({
    where: { phone: testEmpPhone },
    update: {},
    create: {
      name: "Test Sales Employee",
      phone: testEmpPhone,
      passwordHash: testEmpPasswordHash,
      role: "sales_employee",
      districtId: chennai.id,
    },
  });
  console.log(`Seeded test sales employee (phone: ${testEmpPhone}, password: employee123)`);

  type VariantTemplate = "LIQUID" | "POWDER" | "SINGLE";

  const VARIANT_SIZES: Record<VariantTemplate, { sizeLabel: string; unit: string; sortOrder: number }[]> = {
    LIQUID: [
      { sizeLabel: "20L", unit: "L", sortOrder: 0 },
      { sizeLabel: "10L", unit: "L", sortOrder: 1 },
      { sizeLabel: "4L", unit: "L", sortOrder: 2 },
      { sizeLabel: "1L", unit: "L", sortOrder: 3 },
    ],
    POWDER: [
      { sizeLabel: "40KG", unit: "KG", sortOrder: 0 },
      { sizeLabel: "20KG", unit: "KG", sortOrder: 1 },
      { sizeLabel: "5KG", unit: "KG", sortOrder: 2 },
      { sizeLabel: "1KG", unit: "KG", sortOrder: 3 },
    ],
    SINGLE: [{ sizeLabel: "STD", unit: "PC", sortOrder: 0 }],
  };

  const PRODUCTS: { name: string; shortCode: string; category: string; template: VariantTemplate }[] = [
    { name: "ROALUX PREMIUM EMULSION", shortCode: "RPE", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX WEATHER SHINE EMULSION", shortCode: "RWS", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX CEILING EMULSION", shortCode: "RCW", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX EXTERIOR EMULSION", shortCode: "REX", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX SMOOTH EMULSION(INTERIOR)", shortCode: "RSE", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX SHINE EMULSION", shortCode: "RXS", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX HI GLOSS EMULSION", shortCode: "RGP", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX INTERIOR SHINE", shortCode: "RIS", category: "Emulsion", template: "LIQUID" },
    { name: "AMAZE WALL GUARD EMULSION(EXTERIOR)", shortCode: "AWG", category: "Emulsion", template: "LIQUID" },
    { name: "AMAZE INTERIOR EMULSION", shortCode: "APE", category: "Emulsion", template: "LIQUID" },
    { name: "ASTRA MULTIPURPOSE EMULSION", shortCode: "AME", category: "Emulsion", template: "LIQUID" },
    { name: "HITECH EXTERIOR EMULSION", shortCode: "HEX", category: "Emulsion", template: "LIQUID" },
    { name: "RIU EMULSION", shortCode: "RUE", category: "Emulsion", template: "LIQUID" },
    { name: "ROALUX WATERBASE PRIMER(EXTERIOR)", shortCode: "REW", category: "Primer", template: "LIQUID" },
    { name: "ROALUX WATERBASE PRIMER(INTERIOR)", shortCode: "RWP", category: "Primer", template: "LIQUID" },
    { name: "ROALUX DAMP SHEATH PRIMER", shortCode: "RDS", category: "Primer", template: "LIQUID" },
    { name: "ROALUX SALTECH PRIMER", shortCode: "RST", category: "Primer", template: "LIQUID" },
    { name: "AMAZE WATER BASE PRIMER(EXTERIOR)", shortCode: "AEW", category: "Primer", template: "LIQUID" },
    { name: "ASTRA MULTIPURPOSE PRIMER", shortCode: "AMP", category: "Primer", template: "LIQUID" },
    { name: "HITECH WATERBASE PRIMER(EXTERIOR)", shortCode: "HEW", category: "Primer", template: "LIQUID" },
    { name: "HITECH WATERBASE PRIMER(INTERIOR)", shortCode: "HWP", category: "Primer", template: "LIQUID" },
    { name: "RIU PRIMER", shortCode: "RUP", category: "Primer", template: "LIQUID" },
    { name: "BESTCOAT MULTIPURPOSE PRIMER", shortCode: "BMP", category: "Primer", template: "LIQUID" },
    { name: "DAYLIGHT MULTIPURPOSE PRIMER", shortCode: "DMP", category: "Primer", template: "LIQUID" },
    { name: "LWP PRIMER", shortCode: "LWP", category: "Primer", template: "LIQUID" },
    { name: "ROALUX DAMP PROOF", shortCode: "RDP", category: "Damp Proof", template: "LIQUID" },
    { name: "HITECH DAMP PROOF", shortCode: "HDP", category: "Damp Proof", template: "LIQUID" },
    { name: "ROALUX DISTEMPER", shortCode: "RD", category: "Distemper", template: "LIQUID" },
    { name: "HITECH DISTEMPER", shortCode: "HD", category: "Distemper", template: "LIQUID" },
    { name: "SUPERSTAR TIN DISTEMPER", shortCode: "STD", category: "Distemper", template: "LIQUID" },
    { name: "SUPERSTAR PACKET DISTEMPER", shortCode: "SPD", category: "Distemper", template: "POWDER" },
    { name: "ROALUX ACRYLIC WALLPUTTY", shortCode: "RAP", category: "Wall Putty", template: "POWDER" },
    { name: "HITECH ACRYLIC WALLPUTTY", shortCode: "HAP", category: "Wall Putty", template: "POWDER" },
    { name: "ROALUX CEMENTBASE WALLPUTTY", shortCode: "RCP", category: "Wall Putty", template: "POWDER" },
    { name: "SUPERSTAR CEMENTBASE WALLPUTTY", shortCode: "SCP", category: "Wall Putty", template: "POWDER" },
    { name: "AMAZE CEMENTBASE WALLPUTTY", shortCode: "ACP", category: "Wall Putty", template: "POWDER" },
    { name: "ROALUX TEXTURE PUTTY", shortCode: "RTP", category: "Wall Putty", template: "POWDER" },
    { name: "ROALUX SYNTHETIC PRIMER", shortCode: "RSP", category: "Primer", template: "LIQUID" },
    { name: "ROALUX UNIVERSAL STAINER", shortCode: "RUS", category: "Stainer", template: "LIQUID" },
    { name: "ROALUX WATERPROOF PUTTY", shortCode: "RPW", category: "Wall Putty", template: "POWDER" },
    { name: "ROALUX WATERPROOF COMPOUND", shortCode: "RWC", category: "Waterproofing", template: "LIQUID" },
    { name: "ROALUX CRACKZIP", shortCode: "RCZ", category: "Accessory", template: "SINGLE" },
    { name: "ROALUX BOND BOOSTER", shortCode: "RBB", category: "Accessory", template: "SINGLE" },
    { name: "ROALUX ROLLER", shortCode: "RR", category: "Roller", template: "SINGLE" },
    { name: "RIU ROLLER", shortCode: "RIU", category: "Roller", template: "SINGLE" },
  ];

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { shortCode: p.shortCode },
      update: { name: p.name, category: p.category },
      create: { name: p.name, shortCode: p.shortCode, category: p.category },
    });
    for (const v of VARIANT_SIZES[p.template]) {
      await prisma.productVariant.upsert({
        where: { productId_sizeLabel: { productId: product.id, sizeLabel: v.sizeLabel } },
        update: {},
        create: {
          productId: product.id,
          sizeLabel: v.sizeLabel,
          unit: v.unit,
          sortOrder: v.sortOrder,
          price: 0,
        },
      });
    }
  }
  console.log(`Seeded ${PRODUCTS.length} products with size variants (prices default to 0 — set in admin)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
