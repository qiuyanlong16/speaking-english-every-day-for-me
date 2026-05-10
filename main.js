// main.js — Authentication module

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
  if (GitHubAPI.isAuthenticated()) {
    initApp();
  } else {
    showTokenInput();
  }
});
