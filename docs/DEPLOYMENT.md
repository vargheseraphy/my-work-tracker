# Deployment: Oracle Cloud Always Free

Repotra on one always-free OCI virtual machine: the Fastify server, PostgreSQL 16, the built web
app behind nginx, and the reminder jobs. Everything on one box, no code changes from what runs
locally.

> **Status: untested.** This is a checklist written from the repository, not from a machine that
> has run it. Anything I could not verify is marked **[verify]**. Work through it in order and
> treat each command as something to read before you run it.

---

## 1. What you end up with

| Piece | Where |
| --- | --- |
| Web app | nginx serves `apps/web/dist` on 443 |
| API | nginx proxies `/api` to the Fastify server on 127.0.0.1:3000 |
| Database | PostgreSQL 16 on the same machine, listening on localhost only |
| Jobs | `node-cron` inside the server: reminders every 15 minutes, report Monday 09:00 |
| Proof files | `/var/lib/repotra/uploads`, on the instance's own disk |
| Backups | Nightly `pg_dump`, kept 14 days |

The server only ever listens on 127.0.0.1, so the database and the API are not reachable from the
internet directly. Everything public goes through nginx.

---

## 2. Before you start

- A domain name you control, pointed at the instance's public IP with an A record. HTTPS and the
  CSRF origin check both need a real hostname; an IP address alone will not do.
- An SMTP account for real email. Mailpit is local-only and must not be used here. See
  `docs/EMAIL.md`.
- SSH access to the instance.

---

## 3. Create the instance

In the OCI console, create a VM instance:

| Setting | Value |
| --- | --- |
| Shape | Ampere A1 (ARM), within the Always Free allowance |
| Image | Ubuntu 22.04 or 24.04 |
| Boot volume | Keep inside the Always Free allowance **[verify]** |
| SSH keys | Add your public key |

Three OCI-specific things that catch people out:

1. **ARM, not x86.** Node 20, PostgreSQL 16 and `argon2` all have working ARM builds, so the stack
   is fine, but choose ARM images deliberately.
2. **Always Free ARM capacity is often exhausted** in busy regions. If you get an out-of-capacity
   error, retry later or choose another region. **[verify]** current availability.
3. **Exact free-tier shape limits change.** Confirm the current Always Free allowance in the
   console rather than trusting figures from elsewhere. **[verify]**

---

## 4. Open both firewalls

This is the single most common OCI mistake. There are **two** firewalls and both must allow
traffic, or you get a silent timeout with nothing in any log.

**a) OCI, in the console.** On the instance's subnet, add ingress rules to the Security List or
Network Security Group:

| Source | Protocol | Port |
| --- | --- | --- |
| 0.0.0.0/0 | TCP | 80 |
| 0.0.0.0/0 | TCP | 443 |

**b) On the instance.** Oracle's Ubuntu images ship with the local firewall closed:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Do **not** open 3000 or 5432. Neither should be reachable from outside.

---

## 5. Install the software

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

node --version    # expect v20 or newer
psql --version    # expect 16.x
```

If `psql --version` is not 16, Ubuntu's default differs from what this project targets. Add the
PostgreSQL apt repository and install `postgresql-16` explicitly. **[verify]** for your image.

---

## 6. Get the code on the box

```bash
sudo mkdir -p /srv/repotra /var/lib/repotra/uploads
sudo chown -R $USER:$USER /srv/repotra /var/lib/repotra
git clone <your repo url> /srv/repotra
cd /srv/repotra
npm ci
```

`/var/lib/repotra/uploads` sits outside the checkout on purpose, so a redeploy never touches
uploaded proof.

---

## 7. Database

Create the owner role and the database. The owner runs migrations; the app never uses it.

```bash
sudo -u postgres psql <<'SQL'
create role gtm_owner login password 'PUT-A-STRONG-PASSWORD-HERE';
create database gtm owner gtm_owner;
SQL
```

Generate secrets on the box rather than inventing them by hand:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('GTM_APP_PASSWORD=' + require('crypto').randomBytes(24).toString('base64url'))"
```

Keep both. They go in `.env` in the next step.

Run the migrations as the owner:

```bash
cd /srv/repotra
npm run db:migrate
```

Migration `0000` creates the `authenticated` and `gtm_app` roles as `nologin`. Give `gtm_app` its
login and password, using the value you generated:

```bash
sudo -u postgres psql -d gtm -c "alter role gtm_app with login password 'THE-GTM-APP-PASSWORD';"
```

> Do **not** run `npm run db:setup` here. It is written for local use and also creates the
> `gtm_test` and `gtm_verify` databases.

---

## 8. Configure

Create `/srv/repotra/.env`. It is git-ignored and must stay that way.

```ini
NODE_ENV=production
APP_URL=https://tracker.example.com      # your real domain, no trailing slash
PORT=3000

DATABASE_URL_OWNER=postgres://gtm_owner:OWNER-PASSWORD@localhost:5432/gtm
GTM_APP_PASSWORD=THE-GTM-APP-PASSWORD
DATABASE_URL=postgres://gtm_app:THE-GTM-APP-PASSWORD@localhost:5432/gtm

SESSION_SECRET=THE-64-HEX-CHARS-YOU-GENERATED
SESSION_IDLE_HOURS=12
SESSION_MAX_DAYS=7

UPLOAD_DIR=/var/lib/repotra/uploads
MAX_UPLOAD_BYTES=5242880

SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
EMAIL_FROM="Repotra <tracker@example.com>"

JOBS_ENABLED=true
REMINDER_CRON="*/15 * * * *"
REPORT_CRON="0 9 * * 1"
REPORT_TIMEZONE=Asia/Kolkata

ALLOWED_EMAIL_DOMAINS=example.com
INVITE_TOKEN_HOURS=48
```

```bash
chmod 600 /srv/repotra/.env
```

Four values that cause real failures if wrong:

| Value | If it is wrong |
| --- | --- |
| `APP_URL` | Every non-GET `/api` call returns 403. The origin check compares against this exactly. |
| `NODE_ENV=production` | The session cookie is not marked `Secure`. |
| `SESSION_SECRET` | Shorter than 32 characters and the server refuses to start. |
| `DATABASE_URL` | If it uses the owner role the server refuses to start, by design. |

---

## 9. Build

```bash
cd /srv/repotra
npm run build
```

This builds `packages/shared`, the server to `apps/server/dist`, and the web app to
`apps/web/dist`.

---

## 10. Run it under systemd

`/etc/systemd/system/repotra.service`:

```ini
[Unit]
Description=Repotra server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/srv/repotra
ExecStart=/usr/bin/node apps/server/dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/repotra

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now repotra
sudo systemctl status repotra
curl -i http://127.0.0.1:3000/api/auth/me     # expect 401 {"error":"signin"}
```

A 401 is the correct answer here. It proves the server is up and refusing an unauthenticated
request.

---

## 11. nginx

`/etc/nginx/sites-available/repotra`:

```nginx
server {
    listen 80;
    server_name tracker.example.com;
    root /srv/repotra/apps/web/dist;
    index index.html;

    client_max_body_size 6m;   # above MAX_UPLOAD_BYTES so the app returns the error, not nginx

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Single-page app: unknown paths are routes, not files.
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/repotra /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 12. HTTPS

```bash
sudo certbot --nginx -d tracker.example.com
```

Certbot rewrites the nginx config for 443 and installs a renewal timer. Check it:

```bash
sudo certbot renew --dry-run
```

---

## 13. Create the first admin

```bash
cd /srv/repotra
npm run user:create -- --email you@example.com --name "Your Name" --role admin
```

It prints a set-password link. Open it in a browser to choose your password. From then on, invite
everyone else from Settings in the app.

The email domain must be listed in `ALLOWED_EMAIL_DOMAINS` or the invite is refused.

---

## 14. Backups

Nightly dump, 14 days kept:

```bash
sudo mkdir -p /var/backups/repotra && sudo chown $USER /var/backups/repotra
```

`/srv/repotra/scripts/backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD='OWNER-PASSWORD'
pg_dump -U gtm_owner -h localhost gtm \
  | gzip > "/var/backups/repotra/gtm-$(date +%F).sql.gz"
find /var/backups/repotra -name 'gtm-*.sql.gz' -mtime +14 -delete
```

```bash
chmod 700 /srv/repotra/scripts/backup.sh
crontab -e
# 0 2 * * * /srv/repotra/scripts/backup.sh
```

This writes to the same disk, which protects you from mistakes but not from losing the instance.
Copy the dumps to OCI Object Storage as well if the data matters. **[verify]** the bucket setup.

**Test a restore before you rely on any of this.** A backup you have never restored is a guess.

Also enable unattended security updates:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 15. Deploying a change

```bash
cd /srv/repotra
git pull
npm ci
npm run db:migrate        # only if there are new migrations
npm run build
sudo systemctl restart repotra
```

Migrations are additive by project rule, so this order is safe: an applied migration is never
edited, only new numbered files are added.

---

## 16. Check it works

Run through this after the first deploy. Do not assume a step passed because the one before it
did.

| Check | Expected |
| --- | --- |
| `sudo systemctl status repotra` | active (running) |
| `curl -i http://127.0.0.1:3000/api/auth/me` | 401 `{"error":"signin"}` |
| `https://tracker.example.com` in a browser | Sign-in page, light theme, padlock |
| Sign in as the admin | Dashboard loads |
| Submit a daily log with a proof field above 0 and no file | Refused: "attach a screenshot" |
| Upload a screenshot, submit again | Accepted, file lands under `/var/lib/repotra/uploads` |
| `sudo journalctl -u repotra -n 50` | Reminder job lines, no stack traces |
| Trigger an email, for example an invite | Arrives, and renders with the accent top bar |
| `sudo certbot renew --dry-run` | Succeeds |
| Run the backup script by hand, then restore it into a scratch database | Restores cleanly |

---

## 17. If something is wrong

| Symptom | Likely cause |
| --- | --- |
| Page times out, nothing in nginx logs | OCI ingress rule or local `iptables`. Both must allow 80 and 443. |
| Every save fails with 403 | `APP_URL` does not match the address in the browser. |
| Signed out on every page load | `NODE_ENV` is not `production`, so the cookie is not `Secure` over HTTPS. |
| Server will not start | `SESSION_SECRET` under 32 characters, or `DATABASE_URL` using the owner role. Both are deliberate refusals. Read `journalctl`. |
| Uploads vanish after a deploy | `UPLOAD_DIR` is pointing inside the checkout rather than `/var/lib/repotra/uploads`. |
| Reminders never arrive | `JOBS_ENABLED=false`, or SMTP settings wrong. Check `journalctl` for the job lines. |
| 413 on upload | `client_max_body_size` in nginx is below `MAX_UPLOAD_BYTES`. |

---

## 18. What is not covered here

- **Nothing in this document has been run.** Treat it as a first draft to correct as you go.
- Exact Always Free shape and boot volume limits. Confirm in the console. **[verify]**
- PostgreSQL 16 availability on your chosen Ubuntu image. **[verify]**
- Copying backups to OCI Object Storage. **[verify]**
- Moving the database to Neon later. The design supports it: no extensions are used, and
  `withUser()` is safe under transaction pooling. It is a connection string change, nothing more.
