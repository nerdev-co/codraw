# CoDraw — Deployment Guide

Deploy **codraw** to a single AWS EC2 instance (Ubuntu 24.04) with Nginx, PM2, and Certbot, fully automated via GitHub Actions CI/CD.

---

## Architecture

```
                 ┌────────────────┐
                 │    Internet    │
                 └───────┬────────┘
                         │  :80 / :443 (HTTPS)
                 ┌───────▼────────┐
                 │     Nginx      │   TLS + static frontend + reverse proxy
                 └───┬────┬────┬──┘
                     │    │    │
             ┌───────▼┐ ┌─▼────┐ ┌▼────────┐
             │Frontend│ │ HTTP │ │ WebSocket │
             │ Vite   │ │ API  │ │  Backend   │
             │  dist/ │ │:3001 │ │  :8080     │
             └────────┘ └──┬───┘ └┬──────────┘
                           │      │
                     ┌─────▼──────▼─────┐
                     │  Neon PostgreSQL │
                     └──────────────────┘
```

All three services run under **PM2** on one instance. The frontend is a Vite static build served directly by Nginx. Both backends share one Postgres database (Neon).

---

## How CI/CD Works

```
git push origin main
        │
        ▼
┌──────────────────────┐
│ CI/CD workflow       │   one run, two jobs
│  build (typecheck)   │
│  deploy (SSH → EC2)  │
└──────────────────────┘
        │
        ▼
git pull latest              bun install             pm2 restart
(reset --hard)         prisma generate           with updated env
                       prisma migrate deploy
        │
        ▼
drop prebuilt dist/
into apps/frontend/
```

- The single workflow lives in `.github/workflows/ci.yml`
- The `build` job runs on the GitHub Actions runner: typecheck, build, then package `apps/frontend/dist` as a compressed artifact
- The `deploy` job downloads the artifact, transfers it to EC2 via `scp`, then SSHes in to apply it
- The frontend is **never rebuilt on EC2** — the t3.small only receives the prebuilt `dist/` directory extracted into `apps/frontend/`
- Nginx serves the frontend static files directly from `apps/frontend/dist/`
- Deploys are **serialized** (a `deploy-ec2` concurrency group queues runs — no two deploys race on the server)
- After deploying, the workflow runs a **post-deploy health check**: backend `/health`, frontend on `:3000`, and the public `https://` site — the job fails if any is down
- The live commit is recorded in `APP_DIR/.deployed-commit`
- One-time setup (Phases 1–4) is manual; after that, every push to `main` auto-deploys

---

## Prerequisites

| Item          | Where                           | Notes                                         |
| ------------- | ------------------------------- | --------------------------------------------- |
| AWS account   | aws.amazon.com                  | —                                             |
| Domain name   | any registrar                   | A record will point to the EC2 IP             |
| Neon Postgres | neon.tech                       | free tier is fine; DB schema already migrated |
| GitHub repo   | `NalinDalal/codraw`             | main branch contains all deploy fixes         |

---

# Phase 1 — Create the Machine (AWS Console)

### 1. Launch the instance

EC2 → **Launch instance**:

| Setting               | Value                                                       |
| --------------------- | ----------------------------------------------------------- |
| Name                  | `codraw`                                                    |
| AMI                   | **Ubuntu Server 24.04 LTS** (HVM, x86)                      |
| Instance type         | **t3.small** (2 GB RAM — Vite builds need it)               |
| Key pair              | **Create new** → name `codraw` → **download the `.pem`** ⚠️ |
| VPC / subnet          | default                                                     |
| Auto-assign public IP | **Enable**                                                  |
| Storage               | 8 GiB gp3 (default)                                         |

**⚠️ Key pair warning:** the private key is downloadable **once, at creation**. If you lose it, you cannot SSH — you must stop the instance and use _Actions → Security → Change key pair_.

**Security group** — create new (`launch-wizard-*`), three inbound rules, all with source `0.0.0.0/0`:

| Type  | Port | Source      | Why                                                                                                                  |
| ----- | ---- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| SSH   | 22   | `0.0.0.0/0` | needed by **GitHub Actions runners** (dynamic IPs) — key auth is the security, see [Security notes](#security-notes) |
| HTTP  | 80   | `0.0.0.0/0` | public site + Certbot challenge                                                                                      |
| HTTPS | 443  | `0.0.0.0/0` | public site                                                                                                          |

Launch, then note the **Public IPv4 address**.

### 2. Point your domain at the instance

At your DNS provider, set an **A record**:

```
your-domain.com  →  <EC2 public IP>
```

DNS propagation takes a few minutes (up to ~1 hr).

### 3. Test connectivity from your laptop

```bash
nc -vz <EC2-IP> 22
ssh -i ~/Downloads/codraw.pem ubuntu@<EC2-IP>
```

You should get a shell. If you don't, wait a minute and retry; if it persists, see [Troubleshooting](#troubleshooting).

---

# Phase 2 — One-Time Server Setup

Run inside your SSH session.

### 4. Install dependencies

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
sudo ln -s ~/.bun/bin/bun /usr/local/bin/bun
bun add -g pm2
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

> The `/usr/local/bin` symlink is required: GitHub Actions' deploy workflow SSHes in with a **non-interactive** shell, which does not source `~/.bashrc`, so `bun` must be on the system PATH for `bun install` to work during auto-deploys.

### 5. Clone the repository

```bash
sudo mkdir -p /opt/codraw && sudo chown ubuntu /opt/codraw
git clone https://github.com/nerdev/codraw.git /opt/codraw
```

### 6. Configure environment

```bash
cd /opt/codraw
cp .env.example .env
nano .env
```

| Variable                   | Value                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | your Neon connection string (already migrated — `prisma migrate deploy` is a no-op on existing tables)  |
| `JWT_SECRET`               | `openssl rand -base64 32` (≥ 32 chars, not the placeholder)                                             |
| `ALLOWED_ORIGINS`          | `https://your-domain.com` — **required in production**; the API blocks cross-origin requests without it |
| `NEXT_PUBLIC_HTTP_BACKEND` | `https://your-domain.com/api`                                                                           |
| `NEXT_PUBLIC_WS_URL`       | `wss://your-domain.com/ws`                                                                              |

Remove the `HTTP_PORT` / `WS_PORT` lines if present — the code reads `PORT` instead (set by PM2).

> `NEXT_PUBLIC_*` values are **baked in at build time** — change them → rebuild (`bun run build && pm2 restart all`).

### 7. First deploy (manual)

```bash
cd /opt/codraw
bun install --frozen-lockfile
bun run build                          # turbo build: prisma generate + vite build
cd packages/db && bun prisma migrate deploy && cd ../..
pm2 start deploy/pm2/ecosystem.config.js
pm2 save
pm2 startup systemd -u $USER --hp $HOME   # survives reboots
```

**Verify:**

```bash
pm2 list                                # http-backend, ws-backend both "online"
curl localhost:3001/health              # → ok
```

---

# Phase 3 — Nginx + TLS

### 8. Nginx config

The reverse proxy config is committed in the repo — copy it and substitute your domain:

```bash
sudo cp /opt/codraw/deploy/nginx/codraw.conf /etc/nginx/sites-available/codraw
sudo ln -sf /etc/nginx/sites-available/codraw /etc/nginx/sites-enabled/codraw
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

It routes:

| Path    | Upstream         | Notes                                                          |
| ------- | ---------------- | -------------------------------------------------------------- |
| `/`     | static `dist/`   | Vite frontend — served directly by Nginx from `apps/frontend/dist/` |
| `/api/` | `localhost:3001` | HTTP API — **prefix stripped** (backend routes have no `/api`) |
| `/ws`   | `localhost:8080` | WebSocket backend (matches `/ws` and `/ws/*`)                  |

### 9. TLS with Certbot

```bash
sudo certbot --nginx -d your-domain.com
sudo certbot renew --dry-run
```

**Test in a browser:** `https://your-domain.com` → sign up → sign in → create a room.

---

# Phase 4 — GitHub CI/CD

### 10. Configure repository secrets & variables

GitHub repo → **Settings → Secrets and variables → Actions**:

**Secrets** (Settings → Secrets → Actions):

| Name          | Value                                                 |
| ------------- | ----------------------------------------------------- |
| `EC2_SSH_KEY` | **entire contents** of `codraw.pem` (the private key) |
| `EC2_HOST`    | your EC2 **public IP**                                |
| `EC2_USER`    | `ubuntu`                                              |

**Variables** (Settings → Variables → Actions):

| Name       | Value                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REPO_URL` | the clone URL you used in step 5 (`https://github.com/NalinDalal/codraw.git` or the `git@` form) — **do not leave empty**, the deploy fails without it             |
| `APP_DIR`  | `/opt/codraw` (optional — defaults to this)                                                                                                                         |

> Tip: `EC2_HOST` as a domain (`ec2-…compute.amazonaws.com`) can work, but a raw public IP is most reliable.

### 11. Deploy by pushing

```bash
git add . && git commit -m "..." && git push origin main
```

Watch **Actions** — the **CI/CD** run has two jobs:

1. `build` runs typecheck + build
2. On success, `deploy` SSHes in and redeploys

(You'll see both jobs on the same run, attached to the commit.)

From then on, every push to `main` deploys automatically. The workflow:

- `git fetch && git reset --hard origin/main` (pulls latest, keeps untracked `.env`)
- `bun install` (resolves workspace packages, installs deps)
- drops the prebuilt `dist/` artifact into `apps/frontend/`
- `prisma generate` + `prisma migrate deploy`
- `pm2 start deploy/pm2/ecosystem.config.js --update-env` (idempotent, starts backends only)
- writes the deployed commit SHA to `APP_DIR/.deployed-commit`
- verifies the deploy with a post-deploy health check (fails the job if the site is down)

### 12. Rollback to a previous deploy

If a new deploy breaks prod, redeploy the last known-good commit:

1. GitHub repo → **Actions** → **CI/CD** → **Run workflow**
2. Under **deploy_ref**, enter the commit SHA from the last good release (or branch name — defaults to `main`)
3. **Run workflow**

The deploy script fetches and `git reset --hard` to that ref, rebuilds, and restarts services. The health check runs against the rolled-back build too.

> To find the last good SHA, on the server: `cat /opt/codraw/.deployed-commit`.

---

## Day-to-Day Operations

| Task                    | Command                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| Check services          | `pm2 list`                                                             |
| View logs               | `pm2 logs --lines 50` or `pm2 logs <app>`                              |
| Restart everything      | `pm2 restart all`                                                      |
| Check deployed commit   | `cat /opt/codraw/.deployed-commit`                                     |
| Change `.env`           | edit `/opt/codraw/.env`, then `pm2 restart all`                        |
| Change frontend env     | edit `.env`, then `cd /opt/codraw && bun run build && pm2 restart all` |
| Run migrations manually | `cd /opt/codraw/packages/db && bun prisma migrate deploy`              |
| Nginx status / reload   | `sudo systemctl status nginx` / `sudo systemctl reload nginx`          |
| Renew certs (auto)      | `sudo certbot renew --dry-run` to verify                               |
| Rollback a deploy       | GitHub Actions → **CI/CD** → **Run workflow** → `deploy_ref` = old commit SHA |

---

## Environment Variables Reference

| Variable                   | Required | Used by                | Description                                          |
| -------------------------- | -------- | ---------------------- | ---------------------------------------------------- |
| `DATABASE_URL`             | ✅       | db, http, ws           | Neon PostgreSQL connection string                    |
| `JWT_SECRET`               | ✅       | http, ws               | JWT signing secret, ≥ 32 chars                       |
| `ALLOWED_ORIGINS`          | ✅ prod  | http                   | Comma-separated CORS origins (prod default: blocked) |
| `NEXT_PUBLIC_HTTP_BACKEND` | ✅ prod  | frontend               | API base URL (baked at build)                        |
| `NEXT_PUBLIC_WS_URL`       | ✅ prod  | frontend               | WebSocket URL (baked at build)                       |
| `PORT`                     | ❌       | http (3001), ws (8080) | set by the PM2 ecosystem file                        |
| `NODE_ENV`                 | ❌       | http                   | `production` → `Secure` cookies                      |

---

## Security Notes

- **SSH is key-only**: Ubuntu images disable password auth by default (`PasswordAuthentication no`) — an open port 22 with key auth is the accepted pattern for small deployments; GitHub Actions runners need it open because their IPs are dynamic and unknown in advance
- The GitHub Actions **deploy key** (`EC2_SSH_KEY`) can log in as `ubuntu` — keep it out of any public repo or log
- Only ports **22, 80, 443** are open; the app ports (3001/8080) are bound to localhost
- Optional hardening: `fail2ban`, restrict port 22 to your IP for interactive sessions (the workflow will need its own rule), or move to SSM Session Manager
- `JWT_SECRET` and `DATABASE_URL` live only in `/opt/codraw/.env` (gitignored) and GitHub secrets — never commit them

---

## Troubleshooting

**`ssh: connect to host … port 22: Connection timed out`**

1. Instance state is `running` and has a public IP
2. Security group has SSH from `0.0.0.0/0`
3. Test `nc -vz <IP> 22` — if your laptop also times out, it's AWS-side; if only the workflow times out, the SG restricts to your IP

**`Permission denied (publickey)`**

- Wrong key pair / lost `.pem` → _Actions → Security → Change key pair_ (instance must be stopped)
- Wrong username → must be `ubuntu`

**Deploy job fails at clone step**

- `REPO_URL` variable empty or doesn't match the server's clone URL

**Frontend blank page / API errors**

- Frontend is baked at build time → rebuild: `cd /opt/codraw && bun run build && pm2 restart all`
- Check `ALLOWED_ORIGINS` includes your domain — prod CORS blocks everything without it
- Nginx `/api/` must strip the prefix (`proxy_pass http://localhost:3001/;`)

**WebSocket won't connect**

- `NEXT_PUBLIC_WS_URL` uses `wss://` (not `ws://`)
- Nginx location is `/ws` (no trailing slash — must match `wss://domain/ws`)
- `pm2 logs ws-backend` for errors

**Services crash / 500s**

- `pm2 logs --lines 50`
- `JWT_SECRET` missing or < 32 chars (app exits at startup — `validateEnv`)
- `DATABASE_URL` wrong, or run `cd /opt/codraw/packages/db && bun prisma migrate status`
