# DevNotes

DevNotes is an interview-focused developer notes app for storing Q&A, coding solutions, and markdown blog notes with GitHub-backed persistence.

Live app: https://manikantatarun.github.io/DevNotes/

## Features

- Note types: Q&A, Coding, Blog
- Filtered search (type, category, language, text)
- In-view note navigation (previous/next within current filtered scope)
- Markdown blog editor with live preview
- Rich blog authoring actions (headings, lists, links, code blocks)
- Blog image upload support
  - Signed-in GitHub mode: uploads image files into the data repository
  - Local mode: embeds images as data URLs
- GitHub OAuth sign-in with read/write access checks
- Scalable metadata indexing in Cloudflare KV

## Architecture Overview

### Frontend

- React + TypeScript + Vite
- Main note UX in [src/components/features](src/components/features)
- Authentication state in [src/context/AuthContext.tsx](src/context/AuthContext.tsx)

### Storage Layer

The app uses a storage abstraction via [src/services/storage/IStorageService.ts](src/services/storage/IStorageService.ts).

Current implementations:

- [src/services/storage/GitHubStorageService.ts](src/services/storage/GitHubStorageService.ts)
  - Notes stored as `notes/{id}.json`
  - Metadata stored as `meta/{id}.json`
  - Blog images stored under `images/YYYY/MM/...`
- [src/services/storage/LocalStorageService.ts](src/services/storage/LocalStorageService.ts)

### Cloudflare Worker

Worker source: [cloudflare-worker/worker.js](cloudflare-worker/worker.js)

Responsibilities:

- OAuth code exchange (`POST /oauth/token`)
- Metadata query endpoint (`GET /notes/meta`)
- CRUD endpoints for authenticated writers
- KV metadata index bootstrap/sync

#### Auto Sync Behavior

- **First bootstrap**: if KV is empty, metadata is loaded from jsDelivr CDN.
- **Scheduled sync**: Cloudflare cron runs hourly (configured in [cloudflare-worker/wrangler.toml](cloudflare-worker/wrangler.toml)).
- **Manual sync endpoint**: `POST /notes/sync` refreshes from GitHub API using an authenticated token.

## Repository Structure

```text
.
├── cloudflare-worker/         # Worker + Wrangler config
├── src/                       # Frontend source
│   ├── components/
│   ├── context/
│   ├── hooks/
│   ├── services/storage/
│   ├── config/
│   ├── constants/
│   ├── types/
│   └── utils/
└── .github/workflows/         # CI/CD (Pages deploy)
```

## Environment Configuration

Frontend build variables (GitHub Actions repository variables):

- `VITE_GITHUB_CLIENT_ID`
- `VITE_OAUTH_WORKER_URL`
- `VITE_DATA_REPO_OWNER`
- `VITE_DATA_REPO_NAME`
- `VITE_DATA_REPO_BRANCH`
- `VITE_APP_BASE_URL`

Worker config and secrets:

- Vars in [cloudflare-worker/wrangler.toml](cloudflare-worker/wrangler.toml)
- Required secret: `GITHUB_CLIENT_SECRET`

Set worker secret:

```bash
cd cloudflare-worker
npx wrangler secret put GITHUB_CLIENT_SECRET
```

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Deploy frontend to GitHub Pages:

```bash
npm run deploy
```

## CI/CD

GitHub Pages workflow: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

- Build + lint on PRs to `main`
- Deploy on pushes to `main`/`release` branches and on published GitHub Releases
- Uses repository variables for all Vite config

## Notes

- CDN-based metadata sync can be stale briefly due to CDN cache propagation.
- Manual sync is available when immediate freshness is required.

## License

MIT
```
