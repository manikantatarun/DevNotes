# Quick Start Guide

## TL;DR - Get up and running in 5 minutes

### 1. Create GitHub App (2 minutes)
```bash
# Go to: https://github.com/settings/apps/new
# Settings:
#   - Name: devnotes-app
#   - Permissions: Contents (Read & Write)
#   - Install on: devnotes-data repo
# Save: App ID, Private Key (.pem), Installation ID
```

### 2. Setup D1 & Deploy (2 minutes)
```bash
cd cloudflare-worker

# Create database
npx wrangler d1 create devnotes-db

# Copy database_id to wrangler.toml [[d1_databases]] section

# Run schema
npx wrangler d1 execute devnotes-db --file=./schema.sql --remote

# Set secrets
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY  # Paste entire .pem contents
npx wrangler secret put GITHUB_APP_INSTALLATION_ID

# Deploy
npx wrangler deploy
```

### 3. Initial Sync (1 minute)
```bash
# Sync data from GitHub to D1
curl -X POST https://devnotes.YOUR_SUBDOMAIN.workers.dev/notes/sync

# Test query
curl "https://devnotes.YOUR_SUBDOMAIN.workers.dev/notes/meta?pageSize=5"
```

## What Changed?

| Before | After |
|--------|-------|
| KV for metadata | D1 (SQLite) for metadata |
| No caching | KV for CDN cache |
| OAuth App | GitHub App (better!) |
| Client-side search | Server-side FTS |

## New Features

✅ **Full-text search** - Search across all note content  
✅ **CDN caching** - Faster note content loading  
✅ **Better filtering** - SQL-based queries  
✅ **Auto-sync** - Hourly cron job  
✅ **Higher rate limits** - 5,000/hour vs 60/hour  

## Key Endpoints

```bash
# Search notes
GET /notes/meta?q=async&language=python

# Get note content (cached)
GET /notes/:id

# Sync metadata
POST /notes/sync

# Create/Update/Delete (GitHub App auth)
POST /notes/create
POST /notes/update
POST /notes/delete
```

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed documentation.
