// Puts the demo salespeople (RLX003–RLX006 from seed-demo.ts) on duty and
// moves them around their districts through the real API, so the admin Live
// Map shows several moving staff during a presentation. These are simulated;
// say so when demoing. Ctrl+C takes them off duty again.
//
//   npm run demo:live            (API on http://localhost:4010; Ctrl+C stops)
//   npm run demo:live -- 90      (stops by itself after 90 minutes)
//   DEMO_API_URL=… npm run demo:live
import { prisma } from "../src/db";

const API = process.env.DEMO_API_URL ?? "http://localhost:4010";
const PASSWORD = "demo@1234";
const PHONES = ["9000000003", "9000000004", "9000000005", "9000000006"];
const TICK_MS = 30_000;

interface Walker {
  name: string;
  token: string;
  lat: number;
  lng: number;
  heading: number;
  home: { lat: number; lng: number };
}

async function call(path: string, method: string, token: string | null, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { in: PHONES } },
    include: { district: true, employeeLocation: true },
  });
  await prisma.$disconnect();
  if (users.length === 0) throw new Error("No demo salespeople found; run npm run demo:seed first.");

  const walkers: Walker[] = [];
  for (const u of users) {
    const { accessToken } = await call("/api/auth/login", "POST", null, { phone: u.phone, password: PASSWORD });
    const home = { lat: u.district!.centerLat, lng: u.district!.centerLng };
    const start = u.employeeLocation ?? home;
    await call("/api/tracking/duty", "POST", accessToken, { onDuty: true, lat: start.lat, lng: start.lng });
    walkers.push({ name: u.name, token: accessToken, lat: start.lat, lng: start.lng, heading: Math.random() * 360, home });
    console.log(`${u.name} on duty in ${u.district!.name}`);
  }

  // Wander in a lazy random walk (~150–400 m a tick), pulled back towards the
  // district centre so nobody drifts off the map.
  async function tick() {
    for (const w of walkers) {
      w.heading += (Math.random() - 0.5) * 70;
      const step = 0.0015 + Math.random() * 0.0025;
      const pull = 0.04;
      w.lat += Math.cos((w.heading * Math.PI) / 180) * step + (w.home.lat - w.lat) * pull;
      w.lng += Math.sin((w.heading * Math.PI) / 180) * step + (w.home.lng - w.lng) * pull;
      try {
        await call("/api/tracking/location", "PATCH", w.token, { lat: w.lat, lng: w.lng, accuracy: 12 });
      } catch (err) {
        console.error(`${w.name}: ${(err as Error).message}`);
      }
    }
    console.log(`${new Date().toLocaleTimeString("en-IN")} moved ${walkers.length} salespeople`);
  }
  await tick();
  const timer = setInterval(tick, TICK_MS);

  const stop = async () => {
    clearInterval(timer);
    for (const w of walkers) {
      await call("/api/tracking/duty", "POST", w.token, { onDuty: false }).catch(() => {});
    }
    console.log("Demo salespeople are off duty.");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // Optional time limit, e.g. `npm run demo:live -- 90` stops after 90 minutes.
  const minutes = Number(process.argv[2]);
  if (minutes > 0) setTimeout(stop, minutes * 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
