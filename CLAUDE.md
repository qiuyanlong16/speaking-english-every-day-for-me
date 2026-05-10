# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A static GitHub Pages web app for daily English speaking practice. Users read aloud a ~100-word daily prompt, their speech is transcribed via Web Speech API, and evaluated by DeepSeek through a GitHub Actions pipeline. Results display on a GitHub-style contribution calendar.

## Architecture

- **Frontend**: Vanilla HTML/CSS/JS served by GitHub Pages (no build step)
- **Data**: JSON files in the repo (`prompts/`, `data/`, `pending/`)
- **AI Evaluation**: GitHub Actions workflow (`.github/workflows/evaluate.yml`) calls DeepSeek API
- **Auth**: GitHub Personal Access Token stored in localStorage

## Key Files

| File | Purpose |
|------|---------|
| `index.html` | Single-page UI structure |
| `main.js` | All app logic: auth, speech, GitHub API, calendar, stats |
| `styles.css` | Mobile-first responsive styles |
| `scripts/generate-prompts.js` | Node.js script to generate prompts via DeepSeek API |
| `.github/workflows/evaluate.yml` | GitHub Actions evaluation pipeline |

## Common Commands

```bash
# Generate 30 starter prompts (needs DEEPSEEK_API_KEY env var)
DEEPSEEK_API_KEY=your-key node scripts/generate-prompts.js

# Push to GitHub
git push origin main

# Test locally
python -m http.server 8000
# Then open http://localhost:8000
```

## Configuration

- `CONFIG` object in `main.js`: set `GITHUB_USERNAME` and `REPO_NAME`
- GitHub repo secret `DEEPSEEK_API_KEY`: DeepSeek API key for evaluation workflow
- GitHub Pages: enabled on `main` branch, root folder

## Data Model

- `prompts/YYYY-MM-DD.json`: `{date, topic, text}` — daily speaking prompt
- `pending/YYYY-MM-DD.json`: `{date, status, transcript}` — submitted speech awaiting evaluation
- `data/YYYY-MM-DD.json`: `{date, status, score, feedback}` — evaluated result (status: "pass" or "fail")

## Important Notes

- No build tool or bundler — files are served as-is by GitHub Pages
- Speech-to-text uses Web Speech API (works best in Chrome/Edge)
- GitHub PAT needs `repo` scope for the repository
- Calendar renders from `data/` directory files fetched via GitHub Contents API
- GitHub Actions workflow triggers on push to `pending/*.json`
