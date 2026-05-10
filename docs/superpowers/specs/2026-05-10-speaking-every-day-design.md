# Speaking Every Day — Design Spec

## Overview

A static GitHub Pages web app that helps the user practice English speaking daily. Each day a ~100-word English passage appears (topics: tech development, AI, project management, daily life). The user reads it aloud, their speech is transcribed via the browser's Web Speech API, and the transcript is evaluated by DeepSeek via a GitHub Actions pipeline. Results are visualized on a GitHub-style contribution calendar (green = passed, red = missed).

**Repository:** `speaking-every-day`
**Hosting:** GitHub Pages (static, no server)
**AI Provider:** DeepSeek API (key stored as GitHub repository secret)

## Architecture

```
┌─────────────────────────────────────┐
│         GitHub Pages (Static)        │
│  index.html + main.js + styles.css   │
│  - Daily prompt + speech capture     │
│  - Contribution calendar rendering   │
│  - Statistics display                │
└─────────────────────────────────────┘
              │ push (GitHub API)
              ▼
┌─────────────────────────────────────┐
│         GitHub Repository            │
│  pending/<date>.json                 │
│  data/<date>.json                    │
│  prompts/<date>.json                 │
└─────────────────────────────────────┘
              │ triggers on push
              ▼
┌─────────────────────────────────────┐
│      GitHub Actions Workflow         │
│  .github/workflows/evaluate.yml      │
│  - Reads pending/<date>.json         │
│  - Calls DeepSeek API                │
│  - Writes data/<date>.json           │
│  - Deletes pending/<date>.json       │
└─────────────────────────────────────┘
```

## Data Model

### Prompts: `prompts/YYYY-MM-DD.json`

```json
{
  "date": "2026-05-10",
  "topic": "AI in Project Management",
  "text": "Artificial intelligence is transforming how we manage projects..."
}
```

Prompt topics lean toward: software development, AI/ML, project management, and everyday life. Each passage is ~100 words.

### Pending Submissions: `pending/YYYY-MM-DD.json`

```json
{
  "date": "2026-05-10",
  "status": "pending",
  "transcript": "Artificial intelligence is transforming..."
}
```

Created when the user submits their speech. Triggers the GitHub Actions workflow.

### Evaluated Results: `data/YYYY-MM-DD.json`

```json
{
  "date": "2026-05-10",
  "status": "pass",
  "score": 0.85,
  "feedback": "Good pronunciation. Minor hesitation on 'allocate'."
}
```

Written by GitHub Actions after DeepSeek evaluation. Status is either `pass` or `fail`.

### Calendar State Logic

- **Green:** `data/YYYY-MM-DD.json` exists with `status: "pass"`
- **Red:** Today has passed (user's local timezone, after 23:59:59), no result file for that date
- **Neutral:** Future dates (no prompt yet)

## GitHub Actions Workflow

**File:** `.github/workflows/evaluate.yml`

**Trigger:** `push` to `pending/*.json`

**Steps:**
1. Checkout the repo
2. Read the pending JSON file to extract `date`, `topic`, `transcript`
3. Call DeepSeek API with evaluation prompt:
   - System prompt defines evaluation criteria (coverage of key ideas, grammatical correctness, fluency)
   - Input: the original prompt text + user's transcript
   - Output format: JSON with `pass`/`fail`, `score` (0-1), `feedback` (brief)
4. Commit `data/<date>.json` with the result
5. Delete `pending/<date>.json` (amend into the same commit to avoid clutter)

**Secrets:** `DEEPSEEK_API_KEY` — stored in repository Settings → Secrets

**Frontend Polling:** After submitting speech, the frontend polls the GitHub API for `data/<date>.json` every 5 seconds (max 3 minutes) with an "Evaluating..." spinner. If timeout, show "Evaluation taking longer than expected. Check back shortly."

## Frontend

### File Structure

```
├── index.html          # Single page, all UI sections
├── main.js             # App logic
├── styles.css          # All styles
├── prompts/            # Daily prompt files (committed to repo)
├── data/               # Evaluated result files (written by Actions)
├── pending/            # Pending submissions (deleted after eval)
└── .github/
    └── workflows/
        └── evaluate.yml
```

### Components

**1. Daily Practice Panel**
- Displays today's prompt topic and passage
- "Start Speaking" button → Web Speech API `SpeechRecognition`
- Live transcript updates as user speaks
- "Submit" button → creates `pending/<date>.json` via GitHub API
- Polling UI: spinner + "Evaluating..." message
- Result display: pass/fail badge, score, feedback text

**2. Contribution Calendar**
- Renders current year as a 7×53 grid (7 days per row, matching GitHub's layout)
- Green square = passed, red = missed, empty = future
- Hover tooltip: date, topic, score (if passed)
- Responsive: scales to mobile viewport

**3. Statistics Bar**
- Current streak (consecutive green days)
- Total passed days this year
- Pass rate (passed / total attempted days)

### Authentication

- User enters their GitHub Personal Access Token (PAT) on first visit
- Token stored in `localStorage`
- Used for all GitHub API calls (reading data files, writing pending submissions)
- Token needs `repo` scope for the repository

### Speech-to-Text

- Primary: Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`)
- Works in Chrome, Edge, Safari
- Fallback: manual text entry box if API not supported
- Language: set to `en-US`

### Offline Support

- Speech transcripts saved to `localStorage` if no connection
- Calendar renders from cached data
- Sync pending submissions when connection returns

## Error Handling

| Scenario | Behavior |
|---|---|
| Microphone permission denied | Show message to enable in browser settings |
| Speech API unsupported | Fall back to manual text input |
| GitHub Actions fails | Retry up to 2 times, then notify user |
| DeepSeek rate limit exceeded | Allow manual self-check pass/fail |
| Duplicate submission same day | Reject with "Already submitted today" message |
| No internet connection | Save to localStorage, sync when online |
| PAT invalid/expired | Show token refresh prompt |

## Prompt Generation

Daily prompts are pre-written JSON files committed to the `prompts/` directory. They follow these topic categories:

1. **Software Development** (40%) — coding practices, debugging, architecture, CI/CD
2. **AI & Machine Learning** (30%) — AI concepts, LLMs, automation, ethics
3. **Project Management** (15%) — Agile, planning, team coordination, risk
4. **Daily Life** (15%) — routines, travel, food, hobbies, relationships

Each passage is ~100 words, at B1-B2 English level, with clear key ideas for evaluation.

**Content note:** ~365 prompt files are needed for a full year. The initial implementation will include 30 starter prompts, with a script to generate additional prompts via DeepSeek API (batch request).

## Future Considerations (Out of Scope)

- Multiple language support
- Voice cloning / TTS for pronunciation comparison
- Social features (sharing streaks)
- Advanced pronunciation scoring
- Mobile native app
