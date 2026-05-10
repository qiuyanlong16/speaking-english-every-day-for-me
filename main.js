// main.js — Authentication module

const CONFIG = {
  GITHUB_USERNAME: "qiuyanlong16",
  REPO_NAME: "speaking-english-every-day-for-me",
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
  if (GitHubAPI.isAuthenticated()) {
    // Token exists — validate it
    GitHubAPI.validateToken().then(valid => {
      if (!valid) {
        GitHubAPI.clearToken();
        showTokenInput();
      } else {
        initApp();
      }
    });
  } else {
    showTokenInput();
  }
}

function showTokenInput() {
  const authPanel = document.getElementById("auth-panel");
  authPanel.innerHTML = `
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
    btn.innerHTML = '<span class="icon"></span> Start Speaking';
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
  renderAuthUI();
});

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
