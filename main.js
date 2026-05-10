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
