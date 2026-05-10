# Speaking Every Day

A static web app for daily English speaking practice, hosted on GitHub Pages. No backend — the repo itself is the database.

## How It Works

1. **Daily prompt** — A ~100-word English passage is generated each day via GitHub Actions and the DeepSeek API
2. **Read aloud** — Use the built-in speech-to-text (Web Speech API) to read the prompt
3. **AI evaluation** — Your transcript is submitted to the repo; a GitHub Action calls DeepSeek to evaluate it against the prompt
4. **Results** — Pass/fail with a score and feedback, displayed on a GitHub-style contribution calendar

All data (`prompts/`, `pending/`, `data/`) lives in the repository, so progress syncs across any device.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla HTML/CSS/JS, no build step |
| **Hosting** | GitHub Pages |
| **Speech-to-text** | Web Speech API (`SpeechRecognition`) |
| **AI evaluation** | DeepSeek API (`deepseek-chat`) |
| **Async pipeline** | GitHub Actions |
| **Auth** | GitHub Personal Access Token (`repo` scope) |

## Architecture

```
User browser
    │
    ├─ GitHub PAT → GitHub API → read prompts/, write pending/
    │
    ▼
GitHub Actions (evaluate.yml)
    │
    ├─ triggers on push to pending/*.json
    ├─ calls DeepSeek API with prompt + transcript
    └─ writes result to data/{date}.json
         └─ calendar reads data/ to render pass/fail grid
```

## Setup

### 1. Repository secrets

In your GitHub repo → Settings → Secrets → Actions, add:

| Secret | Description |
|--------|-------------|
| `DEEPSEEK_API_KEY` | Your DeepSeek API key (used by the evaluation workflow) |

### 2. Frontend auth

Open the app and paste your **GitHub Personal Access Token** (classic, with `repo` scope). It's stored in `localStorage` and used for all GitHub API calls.

Create one at: https://github.com/settings/tokens

### 3. Deploy

Push to `main` and enable GitHub Pages on the branch (Settings → Pages → Source: Deploy from a branch → `main` / root).

## Development

```bash
# Generate 30 starter prompts (needs DEEPSEEK_API_KEY)
DEEPSEEK_API_KEY=your-key node scripts/generate-prompts.js

# Test locally
python -m http.server 8000
# Open http://localhost:8000
```

## Data Model

| Path | Format | Purpose |
|------|--------|---------|
| `prompts/{date}.json` | `{date, topic, text}` | Daily reading prompt |
| `pending/{date}.json` | `{date, status: "pending", transcript}` | Submitted speech awaiting evaluation |
| `data/{date}.json` | `{date, status: "pass"\|"fail", score, feedback}` | Evaluated result |

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `evaluate.yml` | Push to `pending/*.json` | Evaluate spoken transcript with DeepSeek |
| `generate-prompts.yml` | Cron (daily at 00:05 UTC) + manual dispatch | Auto-generate daily prompts |

## Design

- **Theme:** "Midnight Garden" — dark, atmospheric, personal
- **Fonts:** DM Serif Display (display), Source Sans 3 (body), IBM Plex Mono (mono)
- **Layout:** Mobile-first responsive, GitHub-style contribution calendar
