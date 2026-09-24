// Validates required environment variables once, at startup, so a
// misconfigured deploy fails loudly instead of running with unsafe defaults.

const isProduction = process.env.NODE_ENV === "production";

// Values from .env.example that must never reach production.
const PLACEHOLDER_SECRETS = new Set(["change-me-access-secret", "change-me-refresh-secret"]);

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Generate one with: openssl rand -base64 64`);
  }
  if (isProduction && (PLACEHOLDER_SECRETS.has(value) || value.length < 32)) {
    throw new Error(`${name} is a placeholder or shorter than 32 characters; use a random secret in production`);
  }
  return value;
}

function corsOrigin(): string | string[] {
  const value = process.env.CORS_ORIGIN;
  if (!value) {
    if (isProduction) throw new Error("CORS_ORIGIN must be set in production (the admin dashboard's URL)");
    return "*";
  }
  const origins = value.split(",").map((o) => o.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
}

export const config = {
  isProduction,
  jwtAccessSecret: requireSecret("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: requireSecret("JWT_REFRESH_SECRET"),
  corsOrigin: corsOrigin(),
  // Number of reverse proxies in front of the API (Caddy = 1), so rate limiting
  // sees the real client IP rather than the proxy's.
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
};

if (isProduction) {
  const secrets = [config.jwtAccessSecret, config.jwtRefreshSecret];
  if (secrets[0] === secrets[1]) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");
  }
  if (process.env.DISABLE_RATE_LIMIT === "1") {
    throw new Error("DISABLE_RATE_LIMIT is for the test suite only and must not be set in production");
  }
}
