# Deploying PaintTracker

This takes PaintTracker from a laptop to production on **one DigitalOcean
server** (the "Lean" plan, about ₹1,640/month) plus free static hosting for the
dashboard. The same steps work on any Ubuntu server with Docker.

```
Phones ──HTTPS──► api.<domain>  ─► Caddy ─► API (Docker) ─► Postgres (Docker)
Admin browser ──► admin.<domain>  (Cloudflare Pages, static)
```

Replace `example.in` below with your domain.

## 1. Before you start

- A domain, e.g. `example.in` (about ₹800/year).
- A DigitalOcean account.
- A Cloudflare account (free) for the dashboard.
- An Expo account for app builds (`eas whoami` should show it).
- The Google Maps JavaScript API key used by the dashboard.

## 2. Create the server

1. Create a droplet: **Ubuntu 24.04, Bangalore (BLR1), Basic 2 GB / 1 vCPU**.
   Turn on weekly **Backups** (+20%). Add your SSH key.
2. In your domain's DNS, add an **A record** `api` → the droplet's IP.
3. SSH in and install Docker:

   ```sh
   curl -fsSL https://get.docker.com | sh
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```

## 3. First deploy of the API

```sh
git clone https://github.com/arjun-30/sales-tracker.git /opt/paint-tracker
cd /opt/paint-tracker/deploy
cp .env.production.example .env.production
nano .env.production            # fill in every value (see below)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Values for `.env.production`:

| Variable | Value |
|---|---|
| `API_DOMAIN` | `api.example.in` |
| `CORS_ORIGIN` | `https://admin.example.in` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (a different one) |

The API refuses to start if a secret is missing, a placeholder, shorter than
32 characters, or if the two JWT secrets match, or if `CORS_ORIGIN` is unset.
Migrations run automatically on every start.

Check it: `curl https://api.example.in/health` → `{"ok":true}`. Caddy fetches
the HTTPS certificate on first start; give it a minute.

### Seed the database (once)

```sh
docker compose -f docker-compose.prod.yml --env-file .env.production exec \
  -e SEED_ADMIN_PHONE=<your 10-digit number> -e SEED_ADMIN_PASSWORD='<8+ chars>' \
  api npm run seed
```

In production the seed creates the 38 districts, the admin and the product
list, but **not** the test employee, and it does not print the password.

## 4. Deploy the admin dashboard (Cloudflare Pages)

1. Cloudflare → Workers & Pages → Create → Pages → connect the GitHub repo.
2. Settings:
   - Root directory: `admin-web`
   - Build command: `npm ci && npm run build`
   - Output directory: `dist`
   - Environment variables: `VITE_API_URL=https://api.example.in`,
     `VITE_GOOGLE_MAPS_API_KEY=<key>`
3. Custom domain: `admin.example.in`.
4. In Google Cloud, restrict the Maps key to `https://admin.example.in/*`.

`admin-web/public/_redirects` sends every path to `index.html`, so page
refreshes work.

## 5. Build the Android app

1. In `mobile/eas.json`, replace `https://api.CHANGE-ME.in` with
   `https://api.example.in` in the `production` profile.
2. Build:

   ```sh
   cd mobile
   eas build -p android --profile production
   ```

   On the first build, let EAS **generate and store the signing keystore**.
   Keep using EAS for every build: updates must be signed with the same key.
3. Share the APK link from the build page, or for the Play Store build
   `--profile production-playstore` (an `.aab`) and upload it to Play Console
   internal testing.

Production builds block plain-HTTP traffic. Only builds with
`ALLOW_CLEARTEXT_HTTP=1` (the `preview` profile and local Wi-Fi testing via
`mobile/.env`) allow it.

## 6. Before handing it to staff

- [ ] Log in to the dashboard and set **real prices** on Products.
- [ ] Create each salesperson on Employees (their phone number + a password).
- [ ] On each phone: install, log in, go on duty, allow location **"Allow all
      the time"**, and set battery to **Unrestricted** for the app.
- [ ] Confirm the marker moves on the Live Map with the phone locked.
- [ ] Place and confirm one test order, then cancel it.
- [ ] Tell staff their location is tracked only while on duty, and get their
      consent in writing (India's DPDP Act).

## 7. Running it

### Backups (nightly, keep 30 days)

```sh
chmod +x /opt/paint-tracker/deploy/backup.sh
crontab -e
# 30 21 * * * /opt/paint-tracker/deploy/backup.sh >> /var/log/pt-backup.log 2>&1
```

Backups land in `/var/backups/paint-tracker`. Also copy them off the server
(DigitalOcean Spaces or Google Drive, weekly at least): droplet backups alone
don't protect you if the server is deleted.

Restore drill (quarterly):

```sh
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
$DC exec -T postgres createdb -U painttracker painttracker_restore_test
gunzip -c /var/backups/paint-tracker/painttracker-YYYYMMDD-HHMM.sql.gz | \
  $DC exec -T postgres psql -q -U painttracker -d painttracker_restore_test
$DC exec -T postgres psql -U painttracker -d painttracker_restore_test -c 'select count(*) from "Order"'
$DC exec -T postgres dropdb -U painttracker painttracker_restore_test
```

### Purge old location history (monthly)

```sh
# 0 22 1 * * cd /opt/paint-tracker/deploy && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api npm run -s prune:locations >> /var/log/pt-prune.log 2>&1
```

Keeps `LOCATION_RETENTION_DAYS` (default 90) of history.

### Monitoring

- UptimeRobot (free): HTTP monitor on `https://api.example.in/health` every
  minute, alerting your email/phone.
- Logs: `docker compose -f docker-compose.prod.yml logs -f api`

### Updating

```sh
cd /opt/paint-tracker && git pull
cd deploy && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api
```

Take a backup first (`./backup.sh`). New migrations apply on start.

### Rolling back

```sh
cd /opt/paint-tracker && git checkout <previous-commit>
cd deploy && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api
```

A migration that changed data needs the backup restored as well.

## Moving up from the Lean plan

When you pass ~25 staff, move the database to DigitalOcean Managed Postgres
(automatic daily backups): create it in BLR1, restore the latest backup into
it, then remove the `postgres` service from the compose file and point
`DATABASE_URL` at the managed database (add `?sslmode=require`). See the Cost
Estimate for sizes.
