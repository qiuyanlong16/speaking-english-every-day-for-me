# Speaking Every Day — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static GitHub Pages web app for daily English speaking practice with AI evaluation and a GitHub-style contribution calendar.

**Architecture:** Single-page static frontend served by GitHub Pages. Data stored as JSON files in the repo. AI evaluation runs via GitHub Actions on push to `pending/` directory, calling DeepSeek API with key stored as repo secret.

**Tech Stack:** Vanilla HTML/CSS/JS, Web Speech API, GitHub REST API, GitHub Actions, DeepSeek API.

---

## File Map

| File | Purpose |
|------|---------|
| `index.html` | Single page HTML skeleton with all UI sections |
| `main.js` | All app logic: auth, speech, GitHub API, calendar, stats |
| `styles.css` | Mobile-first responsive styles |
| `scripts/generate-prompts.js` | Node.js script to batch-generate starter prompts via DeepSeek |
| `prompts/*.json` | Daily prompt files (30 starters + generated) |
| `pending/*.json` | Pending speech submissions (auto-deleted after eval) |
| `data/*.json` | Evaluated results (written by GitHub Actions) |
| `.github/workflows/evaluate.yml` | GitHub Actions workflow for AI evaluation |
| `CLAUDE.md` | Project guidance for future Claude Code sessions |

---

### Task 1: Repository Skeleton

Set up the basic repo structure for GitHub Pages.

**Files:**
- Create: `index.html`
- Create: `main.js` (empty)
- Create: `styles.css` (empty)
- Create: `prompts/.gitkeep`
- Create: `data/.gitkeep`
- Create: `pending/.gitkeep`
- Create: `.github/workflows/.gitkeep`
- Create: `scripts/.gitkeep`

- [ ] **Step 1: Create skeleton files**

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Speaking Every Day</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <h1>Speaking Every Day</h1>
    <p>Loading...</p>
  </div>
  <script src="main.js"></script>
</body>
</html>
```

```javascript
// main.js — empty, will be filled in later tasks
```

```css
/* styles.css — empty, will be filled in later tasks */
```

- [ ] **Step 2: Create placeholder directories**

```bash
touch prompts/.gitkeep data/.gitkeep pending/.gitkeep scripts/.gitkeep .github/workflows/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add project skeleton for GitHub Pages"
```

---

### Task 2: GitHub Actions Evaluation Workflow

Create the workflow that evaluates speech submissions via DeepSeek API.

**Files:**
- Create: `.github/workflows/evaluate.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/evaluate.yml
name: Evaluate Speaking Submission

on:
  push:
    paths:
      - "pending/*.json"

jobs:
  evaluate:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Get pending file
        id: pending
        run: |
          PENDING_FILE=$(git diff --name-only HEAD~1 HEAD -- pending/ | head -1)
          if [ -z "$PENDING_FILE" ]; then
            echo "No pending file found"
            exit 1
          fi
          echo "file=$PENDING_FILE" >> $GITHUB_OUTPUT
          echo "content=$(cat $PENDING_FILE)" >> $GITHUB_OUTPUT
          DATE=$(jq -r '.date' "$PENDING_FILE")
          echo "date=$DATE" >> $GITHUB_OUTPUT

      - name: Get prompt text
        id: prompt
        run: |
          DATE="${{ steps.pending.outputs.date }}"
          PROMPT_FILE="prompts/${DATE}.json"
          if [ -f "$PROMPT_FILE" ]; then
            TEXT=$(jq -r '.text' "$PROMPT_FILE")
            TOPIC=$(jq -r '.topic' "$PROMPT_FILE")
            echo "text=$TEXT" >> $GITHUB_OUTPUT
            echo "topic=$TOPIC" >> $GITHUB_OUTPUT
          else
            echo "text=No prompt available" >> $GITHUB_OUTPUT
            echo "topic=Unknown" >> $GITHUB_OUTPUT
          fi

      - name: Call DeepSeek API
        id: evaluate
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          PROMPT_TEXT: ${{ steps.prompt.outputs.text }}
          TRANSCRIPT: ${{ steps.pending.outputs.content }}
        run: |
          RESPONSE=$(curl -s -X POST https://api.deepseek.com/v1/chat/completions \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
            -d '{
              "model": "deepseek-chat",
              "messages": [
                {
                  "role": "system",
                  "content": "You are an English speaking evaluator. Judge if the user'\''s spoken transcript adequately covers the key ideas of the given prompt. Return ONLY a JSON object with these fields: {\"status\": \"pass\" or \"fail\", \"score\": 0.0 to 1.0, \"feedback\": \"brief feedback in English\"}. Be lenient — focus on whether key ideas were expressed, not perfect grammar."
                },
                {
                  "role": "user",
                  "content": "Prompt: '"'"'$PROMPT_TEXT'"'"'\n\nTranscript: '"'"'$TRANSCRIPT'"'"'"
                }
              ],
              "response_format": {"type": "json_object"}
            }')
          RESULT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
          echo "result=$RESULT" >> $GITHUB_OUTPUT

      - name: Write result
        run: |
          DATE="${{ steps.pending.outputs.date }}"
          mkdir -p data
          echo '${{ steps.evaluate.outputs.result }}' | jq '. + {"date": "'"$DATE"'"}' > "data/${DATE}.json"

      - name: Delete pending file
        run: |
          rm "${{ steps.pending.outputs.file }}"

      - name: Commit result
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/ pending/
          git commit -m "ci: evaluate speaking submission for ${{ steps.pending.outputs.date }}" || echo "No changes to commit"
          git push
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/evaluate.yml
git commit -m "feat: add GitHub Actions evaluation workflow"
```

---

### Task 3: Generate Starter Prompts Script

Create a Node.js script to batch-generate 30 starter prompts via DeepSeek API.

**Files:**
- Create: `scripts/generate-prompts.js`

- [ ] **Step 1: Write the generator script**

```javascript
// scripts/generate-prompts.js
// Usage: DEEPSEEK_API_KEY=your-key node scripts/generate-prompts.js
// Generates 30 starter prompts covering dev, AI, PM, and daily life topics.

const https = require("https");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("Set DEEPSEEK_API_KEY environment variable");
  process.exit(1);
}

const TOPICS = [
  // Software Development (12)
  { category: "dev", title: "The Importance of Code Reviews", focus: "code reviews, catching bugs early, knowledge sharing, team quality" },
  { category: "dev", title: "Understanding Git Branching", focus: "feature branches, merging, pull requests, version control workflow" },
  { category: "dev", title: "Writing Clean Code", focus: "readable code, naming conventions, functions, maintainability" },
  { category: "dev", title: "Debugging Strategies", focus: "identifying bugs, debugging tools, systematic approach, logging" },
  { category: "dev", title: "API Design Best Practices", focus: "REST APIs, endpoints, status codes, documentation, versioning" },
  { category: "dev", title: "The Role of Testing", focus: "unit tests, integration tests, test-driven development, confidence" },
  { category: "dev", title: "Continuous Integration", focus: "automated builds, running tests, catching issues early, CI pipelines" },
  { category: "dev", title: "Code Refactoring", focus: "improving code structure, not changing behavior, readability, technical debt" },
  { category: "dev", title: "Understanding Databases", focus: "SQL vs NoSQL, tables, queries, data modeling, indexes" },
  { category: "dev", title: "Working with APIs", focus: "HTTP requests, JSON, authentication, rate limits, error handling" },
  { category: "dev", title: "Mobile App Development", focus: "responsive design, native vs cross-platform, app stores, performance" },
  { category: "dev", title: "Security in Web Development", focus: "HTTPS, authentication, input validation, common vulnerabilities" },
  // AI & Machine Learning (9)
  { category: "ai", title: "What Is Artificial Intelligence", focus: "AI definition, machine learning, deep learning, applications in daily life" },
  { category: "ai", title: "Large Language Models", focus: "how LLMs work, training data, prompt engineering, capabilities and limits" },
  { category: "ai", title: "AI in the Workplace", focus: "automation, productivity tools, human-AI collaboration, job changes" },
  { category: "ai", title: "Machine Learning Basics", focus: "supervised learning, training data, models, predictions, accuracy" },
  { category: "ai", title: "Ethics in AI", focus: "bias, fairness, privacy, transparency, responsible AI development" },
  { category: "ai", title: "Computer Vision", focus: "image recognition, object detection, applications, self-driving cars" },
  { category: "ai", title: "Natural Language Processing", focus: "text understanding, translation, sentiment analysis, chatbots" },
  { category: "ai", title: "AI and Creativity", focus: "AI-generated art, music, writing, human creativity vs machine creativity" },
  { category: "ai", title: "The Future of AI", focus: "general AI, AGI, potential benefits, risks, timeline predictions" },
  // Project Management (5)
  { category: "pm", title: "Agile Methodology", focus: "sprints, standups, backlog, user stories, iterative development" },
  { category: "pm", title: "Managing a Team", focus: "communication, delegation, feedback, motivation, conflict resolution" },
  { category: "pm", title: "Risk Management", focus: "identifying risks, mitigation strategies, contingency plans, monitoring" },
  { category: "pm", title: "Setting Project Goals", focus: "SMART goals, milestones, deliverables, stakeholder alignment" },
  { category: "pm", title: "Handling Deadlines", focus: "time management, prioritization, scope management, communication" },
  // Daily Life (4)
  { category: "life", title: "My Daily Routine", focus: "morning habits, work schedule, exercise, evening activities, consistency" },
  { category: "life", title: "Learning a New Skill", focus: "practice, patience, resources, progress tracking, motivation" },
  { category: "life", title: "Travel Experiences", focus: "planning a trip, new cultures, food, language barriers, memories" },
  { category: "life", title: "Healthy Living", focus: "balanced diet, exercise, sleep, mental health, work-life balance" },
];

function callDeepSeek(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an English language teacher. Write a ~100-word English passage about the given topic. The passage should be at B1-B2 English level, clear and natural. Include the key ideas specified. Return ONLY the passage text, nothing else."
        },
        { role: "user", content: prompt }
      ]
    });

    const req = https.request({
      hostname: "api.deepseek.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        const json = JSON.parse(body);
        resolve(json.choices[0].message.content.trim());
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const promptsDir = path.join(__dirname, "..", "prompts");
  const startDate = new Date();

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const filePath = path.join(promptsDir, `${dateStr}.json`);

    console.log(`[${i + 1}/${TOPICS.length}] Generating: ${topic.title} (${dateStr})`);

    try {
      const text = await callDeepSeek(`Topic: ${topic.title}\nKey ideas to include: ${topic.focus}`);

      const promptData = {
        date: dateStr,
        topic: topic.title,
        text: text
      };

      fs.writeFileSync(filePath, JSON.stringify(promptData, null, 2));
      console.log(`  -> Saved to ${filePath}`);

      // Rate limiting: wait 1 second between calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  -> Error: ${err.message}`);
    }
  }

  console.log("\nDone! Generated", TOPICS.length, "prompts.");
}

main();
```

- [ ] **Step 2: Run the script**

```bash
# Replace YOUR_KEY with the actual DeepSeek API key
DEEPSEEK_API_KEY=YOUR_KEY node scripts/generate-prompts.js
```

Expected: 30 JSON files created in `prompts/` directory.

- [ ] **Step 3: Commit**

```bash
git add prompts/
git commit -m "feat: add 30 starter daily speaking prompts"
```

---

### Task 4: Authentication Module

Build the GitHub PAT authentication flow.

**Files:**
- Modify: `main.js` — add `Auth` class/module

- [ ] **Step 1: Add auth functions to main.js**

```javascript
// main.js — Authentication module
// Add these functions to main.js

const CONFIG = {
  // Replace with your actual GitHub username and repo name
  GITHUB_USERNAME: "YOUR_USERNAME",
  REPO_NAME: "speaking-every-day",
};

const GitHubAPI = {
  get baseUrl() {
    return `https://api.github.com/repos/${CONFIG.GITHUB_USERNAME}/${CONFIG.REPO_NAME}`;
  },

  getToken() {
    return localStorage.getItem("github_pat");
  },

  setToken(token) {
    localStorage.setItem("github_pat", token);
  },

  clearToken() {
    localStorage.removeItem("github_pat");
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  async request(path, options = {}) {
    const token = this.getToken();
    if (!token) throw new Error("Not authenticated");

    const url = this.baseUrl + path;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      ...options.headers,
    };

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }

    // Handle 204 No Content
    if (res.status === 204) return null;
    return res.json();
  },

  async validateToken() {
    try {
      await this.request("");
      return true;
    } catch {
      return false;
    }
  }
};

// Auth UI: show token input if not authenticated
function renderAuthUI() {
  const app = document.getElementById("app");
  if (GitHubAPI.isAuthenticated()) {
    // Token exists — validate it
    GitHubAPI.validateToken().then(valid => {
      if (!valid) {
        GitHubAPI.clearToken();
        showTokenInput();
      }
    });
  } else {
    showTokenInput();
  }
}

function showTokenInput() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="auth-panel">
      <h1>Speaking Every Day</h1>
      <p>Enter your GitHub Personal Access Token to continue.</p>
      <input type="password" id="pat-input" placeholder="ghp_..." autocomplete="off">
      <button id="pat-submit" class="btn btn-primary">Connect</button>
      <p class="auth-hint">Token needs <code>repo</code> scope. Create one at <a href="https://github.com/settings/tokens" target="_blank">GitHub Settings</a>.</p>
    </div>
  `;

  document.getElementById("pat-submit").addEventListener("click", handleTokenSubmit);
  document.getElementById("pat-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleTokenSubmit();
  });
}

async function handleTokenSubmit() {
  const input = document.getElementById("pat-input");
  const token = input.value.trim();
  if (!token) return;

  GitHubAPI.setToken(token);
  const valid = await GitHubAPI.validateToken();

  if (!valid) {
    GitHubAPI.clearToken();
    alert("Invalid token. Please check and try again.");
    return;
  }

  initApp();
}
```

- [ ] **Step 2: Commit**

```bash
git add main.js
git commit -m "feat: add GitHub PAT authentication module"
```

---

### Task 5: Daily Practice Panel with Speech Capture

Build the daily speaking UI: show prompt, capture speech, submit to repo.

**Files:**
- Modify: `main.js` — add speech capture and daily practice logic
- Modify: `index.html` — update with practice panel structure

- [ ] **Step 1: Update index.html structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Speaking Every Day</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <!-- Auth panel (shown when no token) -->
    <div id="auth-panel"></div>

    <!-- Main app (hidden until authenticated) -->
    <div id="main-app" style="display:none;">
      <header>
        <h1>Speaking Every Day</h1>
        <div id="stats-bar" class="stats-bar"></div>
      </header>

      <main>
        <!-- Daily Practice Panel -->
        <section id="practice-panel" class="practice-panel">
          <div id="prompt-area">
            <h2 id="prompt-topic"></h2>
            <p id="prompt-text" class="prompt-text"></p>
          </div>

          <div id="speech-area">
            <div id="speech-controls">
              <button id="btn-speak" class="btn btn-large">
                <span class="icon">🎤</span> Start Speaking
              </button>
            </div>
            <div id="transcript-box">
              <p id="transcript-text" class="transcript"></p>
            </div>
            <button id="btn-submit" class="btn btn-primary" style="display:none;">
              Submit
            </button>
          </div>

          <div id="evaluation-area" style="display:none;">
            <div id="eval-spinner">
              <div class="spinner"></div>
              <p>Evaluating your speaking...</p>
            </div>
            <div id="eval-result" style="display:none;">
              <div id="result-badge"></div>
              <p id="result-score"></p>
              <p id="result-feedback"></p>
            </div>
          </div>

          <!-- Manual text fallback (if speech API unsupported) -->
          <div id="manual-input" style="display:none;">
            <p>Speech recognition not supported in this browser. Type your response:</p>
            <textarea id="manual-text" rows="4" placeholder="Type what you would say..."></textarea>
            <button id="btn-submit-manual" class="btn btn-primary">Submit</button>
          </div>
        </section>

        <!-- Contribution Calendar -->
        <section id="calendar-section" class="calendar-section">
          <h2>This Year</h2>
          <div id="calendar-container"></div>
        </section>
      </main>
    </div>
  </div>

  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add daily practice logic to main.js**

Append to `main.js`:

```javascript
// main.js — Daily Practice Module

const STORAGE_KEY = "speaking-every-day";

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

async function loadTodayPrompt() {
  const date = getTodayStr();
  try {
    // Try to load prompt from GitHub
    const data = await GitHubAPI.request(`/contents/prompts/${date}.json?ref=main`);
    const content = atob(data.content);
    return JSON.parse(content);
  } catch (err) {
    // If not found on GitHub, try local storage fallback
    const local = localStorage.getItem(`${STORAGE_KEY}-prompt-${date}`);
    if (local) return JSON.parse(local);
    return null;
  }
}

async function checkTodaySubmission() {
  const date = getTodayStr();
  // Check if already evaluated
  try {
    const data = await GitHubAPI.request(`/contents/data/${date}.json?ref=main`);
    const content = atob(data.content);
    return JSON.parse(content);
  } catch {
    // No result yet — check if pending
    try {
      await GitHubAPI.request(`/contents/pending/${date}.json?ref=main`);
      return { status: "pending" };
    } catch {
      return null; // No submission yet
    }
  }
}

async function submitSpeech(transcript) {
  const date = getTodayStr();
  const pendingData = {
    date: date,
    status: "pending",
    transcript: transcript
  };

  // Write pending file via GitHub API (using contents API with base64)
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(pendingData, null, 2))));

  await GitHubAPI.request(`/contents/pending/${date}.json`, {
    method: "PUT",
    body: JSON.stringify({
      message: `chore: submit speaking practice for ${date}`,
      content: content,
      branch: "main"
    })
  });

  return true;
}

async function pollForResult(maxWaitMs = 180000, intervalMs = 5000) {
  const date = getTodayStr();
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    try {
      const data = await GitHubAPI.request(`/contents/data/${date}.json?ref=main`);
      const content = atob(data.content);
      return JSON.parse(content);
    } catch {
      // Not ready yet — wait
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  return null; // Timed out
}

// Speech Recognition
let recognition = null;
let currentTranscript = "";

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // Show manual input fallback
    document.getElementById("speech-controls").style.display = "none";
    document.getElementById("manual-input").style.display = "block";
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += text + " ";
      } else {
        interim += text;
      }
    }
    currentTranscript = final + interim;
    document.getElementById("transcript-text").textContent = currentTranscript;
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === "not-allowed") {
      alert("Please allow microphone access in your browser settings.");
    }
  };

  recognition.onend = () => {
    // Auto-restart if still recording
    if (document.getElementById("btn-speak").classList.contains("recording")) {
      try {
        recognition.start();
      } catch (e) {
        // Already started
      }
    }
  };

  return true;
}

function toggleRecording() {
  const btn = document.getElementById("btn-speak");
  if (!recognition) return;

  if (btn.classList.contains("recording")) {
    recognition.stop();
    btn.classList.remove("recording");
    btn.innerHTML = '<span class="icon">🎤</span> Start Speaking';
    document.getElementById("btn-submit").style.display = "block";
  } else {
    currentTranscript = "";
    document.getElementById("transcript-text").textContent = "";
    recognition.start();
    btn.classList.add("recording");
    btn.innerHTML = '<span class="icon">️</span> Stop';
    document.getElementById("btn-submit").style.display = "none";
  }
}

async function handleSubmit() {
  const transcript = currentTranscript.trim();
  if (!transcript) {
    alert("Please speak something first.");
    return;
  }

  // Disable UI
  document.getElementById("btn-speak").disabled = true;
  document.getElementById("btn-submit").disabled = true;

  // Show evaluation area
  const evalArea = document.getElementById("evaluation-area");
  evalArea.style.display = "block";
  document.getElementById("eval-spinner").style.display = "block";
  document.getElementById("eval-result").style.display = "none";

  try {
    await submitSpeech(transcript);

    // Poll for result
    const result = await pollForResult();

    document.getElementById("eval-spinner").style.display = "none";
    document.getElementById("eval-result").style.display = "block";

    if (result) {
      displayResult(result);
    } else {
      document.getElementById("result-feedback").textContent =
        "Evaluation is taking longer than expected. Check back shortly.";
    }
  } catch (err) {
    document.getElementById("eval-spinner").style.display = "none";
    document.getElementById("eval-result").style.display = "block";
    document.getElementById("result-feedback").textContent = `Error: ${err.message}`;
  }

  // Re-enable UI
  document.getElementById("btn-speak").disabled = false;
  document.getElementById("btn-submit").disabled = false;
}

function displayResult(result) {
  const badge = document.getElementById("result-badge");
  const score = document.getElementById("result-score");
  const feedback = document.getElementById("result-feedback");

  if (result.status === "pass") {
    badge.className = "badge badge-pass";
    badge.textContent = "✓ Passed";
  } else {
    badge.className = "badge badge-fail";
    badge.textContent = "✗ Failed";
  }

  score.textContent = `Score: ${(result.score * 100).toFixed(0)}%`;
  feedback.textContent = result.feedback || "";

  // Refresh calendar
  loadCalendar();
}
```

- [ ] **Step 3: Add initApp function to main.js**

Append to `main.js`:

```javascript
// main.js — App initialization

async function initApp() {
  // Hide auth, show main app
  document.getElementById("auth-panel").style.display = "none";
  document.getElementById("main-app").style.display = "block";

  // Load today's prompt
  const prompt = await loadTodayPrompt();
  if (prompt) {
    document.getElementById("prompt-topic").textContent = prompt.topic;
    document.getElementById("prompt-text").textContent = prompt.text;
  } else {
    document.getElementById("prompt-area").innerHTML =
      "<p>No prompt available for today. Check back tomorrow!</p>";
  }

  // Init speech recognition
  const supported = initSpeechRecognition();
  if (supported) {
    document.getElementById("btn-speak").addEventListener("click", toggleRecording);
  }

  // Submit button
  document.getElementById("btn-submit").addEventListener("click", handleSubmit);

  // Manual submit
  document.getElementById("btn-submit-manual").addEventListener("click", async () => {
    const text = document.getElementById("manual-text").value.trim();
    if (text) {
      currentTranscript = text;
      await handleSubmit();
    }
  });

  // Check if already submitted today
  const submission = await checkTodaySubmission();
  if (submission && submission.status !== "pending") {
    // Already evaluated
    displayResult(submission);
    document.getElementById("btn-speak").disabled = true;
    document.getElementById("btn-submit").disabled = true;
    document.getElementById("evaluation-area").style.display = "block";
  } else if (submission && submission.status === "pending") {
    // Poll for result
    document.getElementById("evaluation-area").style.display = "block";
    document.getElementById("eval-spinner").style.display = "block";
    pollForResult().then(result => {
      document.getElementById("eval-spinner").style.display = "none";
      if (result) {
        document.getElementById("eval-result").style.display = "block";
        displayResult(result);
      }
    });
  }

  // Load calendar
  await loadCalendar();
}

// Entry point
document.addEventListener("DOMContentLoaded", () => {
  if (GitHubAPI.isAuthenticated()) {
    initApp();
  } else {
    showTokenInput();
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add main.js index.html
git commit -m "feat: add daily practice panel with speech capture"
```

---

### Task 6: Contribution Calendar

Build the GitHub-style contribution calendar visualization.

**Files:**
- Modify: `main.js` — add calendar rendering logic

- [ ] **Step 1: Add calendar logic to main.js**

Append to `main.js`:

```javascript
// main.js — Calendar Module

async function loadCalendar() {
  const container = document.getElementById("calendar-container");
  container.innerHTML = "<p>Loading calendar...</p>";

  try {
    // Fetch all data files from the repo
    const files = await GitHubAPI.request("/contents/data?ref=main");
    const results = {};

    for (const file of files) {
      if (file.name.endsWith(".json")) {
        const content = atob(file.content);
        const data = JSON.parse(content);
        results[data.date] = data;
      }
    }

    renderCalendar(results);
    renderStats(results);
  } catch (err) {
    container.innerHTML = `<p>Error loading calendar: ${err.message}</p>`;
  }
}

function renderCalendar(results) {
  const container = document.getElementById("calendar-container");
  const today = new Date();
  const year = today.getFullYear();
  const todayStr = getTodayStr();

  // Determine date range: Jan 1 of current year to today
  const startDate = new Date(year, 0, 1);
  const endDate = today;

  // Build the grid: 7 rows (days of week) × ~53 columns (weeks)
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let html = '<div class="calendar">';

  // Day-of-week labels
  html += '<div class="calendar-labels">';
  daysOfWeek.forEach(day => {
    html += `<span class="day-label">${day}</span>`;
  });
  html += '</div>';

  // Calculate weeks
  const startDay = startDate.getDay(); // 0=Sun
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const totalCells = startDay + totalDays;
  const weeks = Math.ceil(totalCells / 7);

  // Build grid: weeks as columns
  html += '<div class="calendar-grid">';
  for (let week = 0; week < weeks; week++) {
    html += '<div class="calendar-week">';
    for (let day = 0; day < 7; day++) {
      const cellIndex = week * 7 + day;
      const dayOffset = cellIndex - startDay;

      if (dayOffset < 0 || dayOffset >= totalDays) {
        html += '<div class="calendar-cell empty"></div>';
        continue;
      }

      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + dayOffset);
      const dateStr = cellDate.toISOString().split("T")[0];

      let cellClass = "calendar-cell";
      let tooltip = `data-tooltip="${dateStr}"`;

      if (results[dateStr]) {
        if (results[dateStr].status === "pass") {
          cellClass += " pass";
          tooltip += ` data-tip-text="${dateStr}: Passed (${(results[dateStr].score * 100).toFixed(0)}%)"`;
        } else {
          cellClass += " fail";
          tooltip += ` data-tip-text="${dateStr}: Failed"`;
        }
      } else if (dateStr > todayStr) {
        cellClass += " future";
      } else {
        // Past date with no result = missed
        cellClass += " missed";
        tooltip += ` data-tip-text="${dateStr}: Missed"`;
      }

      html += `<div class="${cellClass}" ${tooltip}></div>`;
    }
    html += '</div>';
  }
  html += '</div>';

  // Legend
  html += '<div class="calendar-legend">';
  html += '<span>Less</span>';
  html += '<div class="legend-cell future"></div>';
  html += '<div class="legend-cell missed"></div>';
  html += '<div class="legend-cell pass"></div>';
  html += '<span>More</span>';
  html += '</div>';

  html += '</div>';

  container.innerHTML = html;
}

function calculateStreak(results) {
  const today = new Date();
  let streak = 0;
  let checkDate = new Date(today);

  // If today has no result yet, start from yesterday
  const todayStr = getTodayStr();
  if (!results[todayStr]) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = checkDate.toISOString().split("T")[0];
    if (results[dateStr] && results[dateStr].status === "pass") {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function renderStats(results) {
  const statsBar = document.getElementById("stats-bar");
  const todayStr = getTodayStr();

  const totalDays = Object.keys(results).length;
  const passedDays = Object.values(results).filter(r => r.status === "pass").length;
  const passRate = totalDays > 0 ? ((passedDays / totalDays) * 100).toFixed(0) : 0;
  const streak = calculateStreak(results);

  statsBar.innerHTML = `
    <div class="stat">
      <span class="stat-value">${streak}</span>
      <span class="stat-label">Day Streak </span>
    </div>
    <div class="stat">
      <span class="stat-value">${passedDays}/${totalDays}</span>
      <span class="stat-label">Passed</span>
    </div>
    <div class="stat">
      <span class="stat-value">${passRate}%</span>
      <span class="stat-label">Pass Rate</span>
    </div>
  `;
}
```

- [ ] **Step 2: Commit**

```bash
git add main.js
git commit -m "feat: add contribution calendar and statistics display"
```

---

### Task 7: Styles with frontend-design Skill

Apply the `frontend-design` skill to create polished, mobile-first responsive styles.

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Invoke frontend-design skill**

Invoke `frontend-design` skill with this request:

> Build mobile-first responsive CSS for a daily English speaking practice app. The HTML structure is:
>
> - Header with h1 title and a stats bar (3 stat items: streak, passed count, pass rate)
> - Practice panel section with: prompt topic (h2), prompt text paragraph, speech controls (start/stop button), transcript display area, submit button, evaluation result area (spinner, pass/fail badge, score, feedback)
> - Contribution calendar section: 7-day-of-week labels, grid of week columns with day cells (states: empty, future, missed/red, pass/green), legend bar
> - Auth panel: heading, paragraph, password input, submit button, help text with link
>
> Requirements:
> - Mobile-first: primary layout is vertical, single-column, optimized for portrait phone screens
> - Touch-friendly: buttons minimum 44px height, adequate spacing between interactive elements
> - Calendar: horizontally scrollable on mobile with fixed day-of-week header, cells minimum 8px
> - Clean typography, modern color palette, smooth transitions
> - Color scheme: green (#2ea043) for pass, red (#da3633) for fail/missed, neutral (#161b22) for background, text (#c9d1d9)
> - Card-based layout for practice panel with rounded corners and subtle shadow
> - Dark theme by default (matches GitHub dark mode aesthetic)
> - Desktop: centered max-width container (800px), calendar full-width within container

- [ ] **Step 2: Review and commit styles**

After the skill produces the CSS, review it and commit:

```bash
git add styles.css
git commit -m "feat: add polished mobile-first responsive styles"
```

---

### Task 8: End-to-End Integration Test

Test the complete flow and set up GitHub Pages.

**Files:**
- Modify: `main.js` — configure `CONFIG.GITHUB_USERNAME` with actual username
- No new files

- [ ] **Step 1: Update config with real values**

In `main.js`, update the `CONFIG` object:

```javascript
const CONFIG = {
  GITHUB_USERNAME: "qiuyanlong",
  REPO_NAME: "speaking-every-day",
};
```

- [ ] **Step 2: Push to GitHub**

```bash
# Create the remote repository on GitHub first, then:
git remote add origin https://github.com/qiuyanlong/speaking-every-day.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Enable GitHub Pages**

Go to repository Settings → Pages → Source: Deploy from branch `main`, folder `/ (root)`.

- [ ] **Step 4: Add GitHub Secret**

Go to repository Settings → Secrets and variables → Actions → New repository secret:
- Name: `DEEPSEEK_API_KEY`
- Value: Your DeepSeek API key

- [ ] **Step 5: Test the full flow**

1. Open the GitHub Pages URL in Chrome (for Speech API support)
2. Enter your GitHub PAT when prompted
3. Verify today's prompt loads
4. Click "Start Speaking", read the prompt aloud, click "Stop"
5. Click "Submit" — verify `pending/<date>.json` is created
6. Wait for GitHub Actions to complete (~30-60 seconds)
7. Verify result appears on the page (pass/fail badge, score, feedback)
8. Verify calendar shows today as green (if passed)
9. Verify statistics bar updates

- [ ] **Step 6: Create CLAUDE.md**

```markdown
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
```

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "docs: add CLAUDE.md and finalize project setup"
git push origin main
```

---

## Task Summary

| Task | Component | Estimated Time |
|------|-----------|----------------|
| 1 | Repository skeleton | 2 min |
| 2 | GitHub Actions workflow | 5 min |
| 3 | Prompt generation script | 5 min |
| 4 | Authentication module | 5 min |
| 5 | Daily practice panel + speech | 10 min |
| 6 | Contribution calendar | 5 min |
| 7 | Styles (frontend-design) | 10 min |
| 8 | Integration test + deploy | 10 min |
