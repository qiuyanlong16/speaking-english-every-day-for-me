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

let pollCancelled = false;

async function pollForResult(maxWaitMs = 180000, intervalMs = 5000) {
  const date = getTodayStr();
  const start = Date.now();
  pollCancelled = false;

  while (Date.now() - start < maxWaitMs) {
    if (pollCancelled) return null;
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
let finalTranscript = ""; // accumulates confirmed final results
let currentTranscript = ""; // final + interim for display
let lastError = null;
let isRecording = false; // tracks actual recording state
let restartTimer = null; // debounce timer for restarts

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
    let interimTranscript = "";

    // Iterate ALL results each time (resultIndex can be unreliable across restarts)
    for (let i = 0; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += text + " ";
      } else {
        interimTranscript += text;
      }
    }

    currentTranscript = finalTranscript + interimTranscript;
    document.getElementById("transcript-text").textContent = currentTranscript.trim();
  };

  recognition.onerror = (event) => {
    lastError = event.error;
    console.error("Speech recognition error:", event.error);

    if (event.error === "not-allowed") {
      isRecording = false;
      updateRecordingUI(false);
      document.getElementById("transcript-text").textContent =
        "Microphone access denied. Please allow it in your browser settings, then try again.";
    } else if (event.error === "no-speech") {
      // Silence detected — keep listening, just show a hint
      if (!currentTranscript.trim()) {
        document.getElementById("transcript-text").textContent = "Listening... speak when ready.";
      }
    } else if (event.error === "aborted") {
      // Often triggered by rapid stop/start — ignore if we just stopped
      console.warn("Recognition aborted (likely from stop/start race)");
    } else {
      // Other errors (network-audio, service-not-allowed, etc.)
      isRecording = false;
      updateRecordingUI(false);
      document.getElementById("transcript-text").textContent =
        `Speech error: ${event.error}. Please try again.`;
    }
  };

  // Auto-restart for continuous mode, but with debounce
  recognition.onend = () => {
    if (isRecording && !lastError) {
      // Small delay to avoid rapid restart race conditions
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {
          // Already started or can't start
        }
      }, 100);
    }
  };

  return true;
}

function updateRecordingUI(recording) {
  const btn = document.getElementById("btn-speak");
  const transcriptBox = document.getElementById("transcript-box");
  const indicator = document.getElementById("recording-indicator");

  if (recording) {
    btn.classList.add("recording");
    btn.innerHTML = '<span class="icon"></span> Stop';
    transcriptBox.classList.add("recording");
    indicator.classList.add("active");
  } else {
    btn.classList.remove("recording");
    btn.innerHTML = '<span class="icon"></span> Start Speaking';
    transcriptBox.classList.remove("recording");
    indicator.classList.remove("active");
  }
}

function toggleRecording() {
  const btn = document.getElementById("btn-speak");
  if (!recognition) return;

  if (isRecording) {
    // Stop recording
    clearTimeout(restartTimer);
    isRecording = false;
    recognition.stop();
    updateRecordingUI(false);
    document.getElementById("btn-submit").style.display = "block";
  } else {
    // Start recording
    finalTranscript = "";
    currentTranscript = "";
    lastError = null;
    document.getElementById("transcript-text").textContent = "Listening...";
    try {
      recognition.start();
      isRecording = true;
      updateRecordingUI(true);
      document.getElementById("btn-submit").style.display = "none";
    } catch (e) {
      isRecording = false;
      updateRecordingUI(false);
      document.getElementById("transcript-text").textContent =
        "Could not start speech recognition. Please try again.";
      console.error("Failed to start recognition:", e);
    }
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

    if (pollCancelled) {
      // User cancelled — reset UI
      hideEvaluation();
      return;
    }

    document.getElementById("eval-result").style.display = "block";

    if (result) {
      displayResult(result);
    } else {
      // Timed out — show timeout message with cancel button visible
      document.getElementById("result-badge").className = "badge badge-fail";
      document.getElementById("result-badge").textContent = "Timed out";
      document.getElementById("result-score").textContent = "";
      document.getElementById("result-feedback").textContent =
        "Evaluation took too long. The AI may still be processing — check back in a moment.";
    }
  } catch (err) {
    document.getElementById("eval-spinner").style.display = "none";
    document.getElementById("eval-result").style.display = "block";
    document.getElementById("result-badge").className = "badge badge-fail";
    document.getElementById("result-badge").textContent = "Error";
    document.getElementById("result-score").textContent = "";
    document.getElementById("result-feedback").textContent = `Error: ${err.message}`;
  }

  // Re-enable UI
  document.getElementById("btn-speak").disabled = false;
  document.getElementById("btn-submit").disabled = false;
}

function hideEvaluation() {
  document.getElementById("evaluation-area").style.display = "none";
  document.getElementById("btn-speak").disabled = false;
  document.getElementById("btn-submit").style.display = "block";
}

function showPendingEvaluation() {
  document.getElementById("evaluation-area").style.display = "block";
  document.getElementById("eval-spinner").style.display = "block";
  document.getElementById("eval-result").style.display = "none";
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

  // Cancel button
  document.getElementById("btn-cancel").addEventListener("click", () => {
    pollCancelled = true;
    hideEvaluation();
  });

  // Retry button
  document.getElementById("btn-retry").addEventListener("click", () => {
    hideEvaluation();
    document.getElementById("btn-speak").disabled = false;
    document.getElementById("btn-submit").disabled = false;
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
    // Pending evaluation — show spinner with cancel option
    showPendingEvaluation();
    pollForResult().then(result => {
      document.getElementById("eval-spinner").style.display = "none";
      if (pollCancelled) {
        hideEvaluation();
        return;
      }
      if (result) {
        document.getElementById("eval-result").style.display = "block";
        displayResult(result);
      } else {
        // Timed out
        document.getElementById("eval-result").style.display = "block";
        document.getElementById("result-badge").className = "badge badge-fail";
        document.getElementById("result-badge").textContent = "Timed out";
        document.getElementById("result-score").textContent = "";
        document.getElementById("result-feedback").textContent =
          "Evaluation took too long. The AI may still be processing — check back in a moment.";
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
    const dataFiles = await GitHubAPI.request("/contents/data?ref=main");
    const results = {};
    for (const file of dataFiles) {
      if (file.name.endsWith(".json")) {
        const content = atob(file.content);
        const data = JSON.parse(content);
        results[data.date] = data;
      }
    }

    // Fetch prompt files to determine calendar start date
    let prompts = {};
    try {
      const promptFiles = await GitHubAPI.request("/contents/prompts?ref=main");
      for (const file of promptFiles) {
        if (file.name.endsWith(".json")) {
          const content = atob(file.content);
          const data = JSON.parse(content);
          prompts[data.date] = data;
        }
      }
    } catch {
      // No prompts yet — that's fine
    }

    renderCalendar(results, prompts);
    renderStats(results);
  } catch (err) {
    container.innerHTML = `<p>Error loading calendar: ${err.message}</p>`;
  }
}

function renderCalendar(results, prompts) {
  const container = document.getElementById("calendar-container");
  const today = new Date();
  const todayStr = getTodayStr();

  // Calendar always shows current year
  const year = today.getFullYear();
  const startDate = new Date(year, 0, 1); // Jan 1
  const endDate = new Date(year, 11, 31); // Dec 31

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const startDay = startDate.getDay(); // 0=Sun
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Calculate total weeks needed for the year
  const totalCells = startDay + 365 + (isLeapYear(year) ? 1 : 0);
  const totalWeeks = Math.ceil(totalCells / 7);

  // Build month headers: each month label spans the weeks it covers
  function getMonthWeekPositions() {
    const months = [];
    let weekCount = 0;

    for (let m = 0; m < 12; m++) {
      const firstDay = new Date(year, m, 1);
      const lastDay = new Date(year, m + 1, 0);

      // Which "cell index" does the first day of this month correspond to?
      const cellIndex = startDay + Math.floor((firstDay - startDate) / (1000 * 60 * 60 * 24));
      const startWeek = Math.floor(cellIndex / 7);

      const endCellIndex = startDay + Math.floor((lastDay - startDate) / (1000 * 60 * 60 * 24));
      const endWeek = Math.floor(endCellIndex / 7);

      const span = endWeek - startWeek + 1;
      months.push({ name: monthNames[m], startWeek, span });
    }
    return months;
  }

  const monthPositions = getMonthWeekPositions();

  let html = '<div class="calendar">';

  // Month headers row
  html += '<div class="calendar-months">';
  monthPositions.forEach(m => {
    html += `<span class="calendar-month-label" style="--col-start:${m.startWeek + 1}; --col-span:${m.span};">${m.name}</span>`;
  });
  html += '</div>';

  // Day-of-week labels + calendar grid
  html += '<div class="calendar-body">';

  // Day labels column
  html += '<div class="calendar-day-labels">';
  daysOfWeek.forEach(day => {
    html += `<div class="day-label">${day}</div>`;
  });
  html += '</div>';

  // Calendar grid
  html += '<div class="calendar-grid">';

  // Render by week (columns)
  for (let week = 0; week < totalWeeks; week++) {
    html += '<div class="calendar-week">';
    for (let day = 0; day < 7; day++) {
      const cellIndex = week * 7 + day;
      const dayOffset = cellIndex - startDay;

      if (dayOffset < 0 || dayOffset >= (isLeapYear(year) ? 366 : 365)) {
        html += '<div class="calendar-cell empty"></div>';
        continue;
      }

      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + dayOffset);
      const dateStr = cellDate.toISOString().split("T")[0];

      let cellClass = "calendar-cell";
      let tooltipText = "";

      if (results[dateStr]) {
        if (results[dateStr].status === "pass") {
          cellClass += " pass";
          tooltipText = `${dateStr}: Passed (${(results[dateStr].score * 100).toFixed(0)}%)`;
        } else {
          cellClass += " fail";
          tooltipText = `${dateStr}: Failed`;
        }
      } else if (dateStr > todayStr) {
        cellClass += " future";
      } else {
        // Past date before prompts exist → neutral, not "missed"
        if (prompts && prompts[dateStr]) {
          cellClass += " missed";
          tooltipText = `${dateStr}: Missed`;
        }
        // If no prompt for this date, leave as default (no color)
      }

      if (tooltipText) {
        html += `<div class="${cellClass}" title="${tooltipText}"></div>`;
      } else {
        html += `<div class="${cellClass}"></div>`;
      }
    }
    html += '</div>';
  }
  html += '</div>'; // .calendar-grid

  html += '</div>'; // .calendar-body

  // Legend
  html += '<div class="calendar-legend">';
  html += '<span>Less</span>';
  html += '<div class="legend-cell future"></div>';
  html += '<div class="legend-cell missed"></div>';
  html += '<div class="legend-cell pass"></div>';
  html += '<span>More</span>';
  html += '</div>';

  html += '</div>'; // .calendar
  container.innerHTML = html;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
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
