/**
 * LibreSpeed Flat Modern Frontend
 *
 * Minimalist, informative, high-utility network diagnostic dashboard
 * Inspired by Cloudflare Speed Test with real-time throughput area charts
 */

// Application States
const STATE_INITIALIZING = -1;
const STATE_IDLE = 0;
const STATE_RUNNING = 1;
const STATE_FINISHED = 2;
const STATE_ERROR = 3;

// Global State
const app = {
  state: STATE_INITIALIZING,
  speedtest: null,
  servers: [],
  selectedServer: null,
  telemetryEnabled: false,
  testData: null,

  // Time-series data points for real-time area charts
  downloadPoints: [],
  uploadPoints: [],

  // Current metric values
  metrics: {
    download: 0,
    upload: 0,
    ping: 0,
    jitter: 0,
    dlProgress: 0,
    ulProgress: 0,
  },

  // Active Phase: 'idle' | 'ping' | 'download' | 'upload' | 'finished'
  phase: 'idle',
};

// Bootstrap application on DOM ready
window.addEventListener("DOMContentLoaded", async () => {
  initSpeedtest();
  bindUIEvents();
  initCanvasCharts();
  setAppState(STATE_INITIALIZING);

  await loadSettings();
  await loadServerList();

  if (app.selectedServer) {
    setAppState(STATE_IDLE);
  } else {
    setAppState(STATE_ERROR);
  }
});

/**
 * Initialize LibreSpeed engine and callbacks
 */
function initSpeedtest() {
  app.speedtest = new Speedtest();

  app.speedtest.onupdate = (data) => {
    app.testData = data;
    handleWorkerUpdate(data);
  };

  app.speedtest.onend = (aborted) => {
    if (aborted) {
      setAppState(STATE_IDLE);
      resetData();
    } else {
      setAppState(STATE_FINISHED);
      finalizeTest();
    }
  };
}

/**
 * Bind DOM Event Listeners & Keyboard Accessibility
 */
function bindUIEvents() {
  const startBtn = document.getElementById("start-button");
  const copySummaryBtn = document.getElementById("copy-summary-btn");
  const shareBtn = document.getElementById("share-results-btn");
  const copyLinkBtn = document.getElementById("copy-link-btn");
  const serverChangeBtn = document.getElementById("server-change-btn");
  const serverSearchInput = document.getElementById("server-search-input");
  const privacyLinks = document.querySelectorAll(".privacy-trigger");

  // Main start/abort button
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (app.state === STATE_RUNNING) {
        app.speedtest.abort();
      } else if (app.state === STATE_IDLE || app.state === STATE_FINISHED) {
        startSpeedtest();
      }
    });
  }

  // Copy summary text to clipboard
  if (copySummaryBtn) {
    copySummaryBtn.addEventListener("click", handleCopySummary);
  }

  // Share modal trigger
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const shareModal = document.getElementById("share-dialog");
      if (shareModal) shareModal.showModal();
    });
  }

  // Copy image link inside share modal
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", handleCopyShareLink);
  }

  // Server selection modal trigger
  if (serverChangeBtn) {
    serverChangeBtn.addEventListener("click", () => {
      if (app.state === STATE_RUNNING) return;
      const modal = document.getElementById("server-dialog");
      if (modal) {
        modal.showModal();
        if (serverSearchInput) {
          serverSearchInput.value = "";
          renderServerList(app.servers);
          serverSearchInput.focus();
        }
      }
    });
  }

  // Server search input
  if (serverSearchInput) {
    serverSearchInput.addEventListener("input", (e) => {
      const query = (e.target.value || "").toLowerCase().trim();
      const filtered = app.servers.filter((s) => {
        return (
          (s.name || "").toLowerCase().includes(query) ||
          (s.sponsorName || "").toLowerCase().includes(query)
        );
      });
      renderServerList(filtered);
    });
  }

  // Privacy modal
  privacyLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const modal = document.getElementById("privacy-dialog");
      if (modal) modal.showModal();
    });
  });

  // Close modals
  document.querySelectorAll(".dialog-close-btn, .dialog-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const modal = e.target.closest("dialog");
      if (modal) modal.close();
    });
  });

  document.querySelectorAll("dialog").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.close();
    });
  });

  // Keyboard Shortcuts: Space / Enter starts; Esc aborts
  window.addEventListener("keydown", (e) => {
    const isModalOpen = Array.from(document.querySelectorAll("dialog")).some((d) => d.open);
    if (isModalOpen) return;

    if (e.key === "Escape" && app.state === STATE_RUNNING) {
      app.speedtest.abort();
      return;
    }

    if (e.code === "Space" || e.key === "Enter") {
      if (document.activeElement && ["input", "textarea"].includes(document.activeElement.tagName.toLowerCase())) {
        return;
      }
      e.preventDefault();
      if (app.state === STATE_RUNNING) {
        app.speedtest.abort();
      } else if (app.state === STATE_IDLE || app.state === STATE_FINISHED) {
        startSpeedtest();
      }
    }
  });

  // Window resize: re-render charts to fit container
  window.addEventListener("resize", () => {
    renderChart("download-canvas", app.downloadPoints, "#f97316", "rgba(249, 115, 22, 0.15)");
    renderChart("upload-canvas", app.uploadPoints, "#8b5cf6", "rgba(139, 92, 246, 0.15)");
  });
}

/**
 * Start Speed Test Execution
 */
function startSpeedtest() {
  if (!app.speedtest || !app.selectedServer || (app.state !== STATE_IDLE && app.state !== STATE_FINISHED)) {
    return;
  }
  resetData();
  setAppState(STATE_RUNNING);
  app.speedtest.start();
}

/**
 * Update Application State Machine
 */
function setAppState(newState) {
  app.state = newState;

  const startBtn = document.getElementById("start-button");
  const serverChangeBtn = document.getElementById("server-change-btn");
  const copySummaryBtn = document.getElementById("copy-summary-btn");
  const shareBtn = document.getElementById("share-results-btn");
  const phaseLabel = document.getElementById("phase-text-label");

  if (startBtn) {
    if (newState === STATE_INITIALIZING) {
      startBtn.className = "btn-flat-primary btn-block";
      startBtn.disabled = true;
      startBtn.textContent = "Connecting to server...";
      if (phaseLabel) phaseLabel.textContent = "Initializing...";
    } else if (newState === STATE_ERROR) {
      startBtn.className = "btn-flat-primary btn-block";
      startBtn.disabled = true;
      startBtn.textContent = "Unable to initialize";
      if (phaseLabel) phaseLabel.textContent = "Configuration or server unavailable";
    } else if (newState === STATE_RUNNING) {
      startBtn.disabled = false;
      startBtn.className = "btn-flat-danger";
      startBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
        </svg>
        Stop Test
      `;
    } else if (newState === STATE_FINISHED) {
      startBtn.disabled = false;
      startBtn.className = "btn-flat-primary btn-block";
      startBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
        Test Again
      `;
    } else {
      startBtn.disabled = false;
      startBtn.className = "btn-flat-primary btn-block";
      startBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        Start Speed Test
      `;
      if (phaseLabel) phaseLabel.textContent = "Ready to test";
    }
  }

  if (serverChangeBtn) {
    serverChangeBtn.style.visibility =
      newState === STATE_RUNNING || newState === STATE_INITIALIZING || newState === STATE_ERROR
        ? "hidden"
        : "visible";
  }

  if (copySummaryBtn) {
    copySummaryBtn.classList.toggle("hidden", newState !== STATE_FINISHED);
  }

  if (shareBtn) {
    const canShare = newState === STATE_FINISHED && app.telemetryEnabled && app.testData && app.testData.testId;
    shareBtn.classList.toggle("hidden", !canShare);
  }
}

/**
 * Process Telemetry Updates from Worker
 */
function handleWorkerUpdate(data) {
  const state = data.testState;

  if (state === 2) {
    app.phase = 'ping';
  } else if (state === 1) {
    app.phase = 'download';
  } else if (state === 3) {
    app.phase = 'upload';
  } else if (state === 4) {
    app.phase = 'finished';
  }

  // Update numerical metrics
  if (data.dlStatus) {
    const dl = Number(data.dlStatus) || 0;
    app.metrics.download = dl;
    const progress = Number(data.dlProgress) || 0;
    app.metrics.dlProgress = progress;

    if (dl > 0) {
      app.downloadPoints.push({ time: progress, speed: dl });
      renderChart("download-canvas", app.downloadPoints, "#f97316", "rgba(249, 115, 22, 0.15)");
    }
  }

  if (data.ulStatus) {
    const ul = Number(data.ulStatus) || 0;
    app.metrics.upload = ul;
    const progress = Number(data.ulProgress) || 0;
    app.metrics.ulProgress = progress;

    if (ul > 0) {
      app.uploadPoints.push({ time: progress, speed: ul });
      renderChart("upload-canvas", app.uploadPoints, "#8b5cf6", "rgba(139, 92, 246, 0.15)");
    }
  }

  if (data.pingStatus) {
    app.metrics.ping = Number(data.pingStatus) || 0;
  }

  if (data.jitterStatus) {
    app.metrics.jitter = Number(data.jitterStatus) || 0;
  }

  if (data.clientIp) {
    updateClientMetadata(data.clientIp);
  }

  if (data.testId && app.telemetryEnabled) {
    const resultsImg = document.getElementById("results-image");
    if (resultsImg) {
      const resultsPath =
        typeof globalThis.SPEEDTEST_RESULTS !== "undefined"
          ? globalThis.SPEEDTEST_RESULTS
          : "results/";
      const resultsUrl = new URL(resultsPath, document.baseURI);
      resultsUrl.searchParams.set("id", data.testId);
      resultsUrl.searchParams.set("style", "modern");
      resultsImg.src = resultsUrl.href;
    }
  }

  updateDOMView();
}

/**
 * Update Numerical Elements & Status Indicators in DOM
 */
function updateDOMView() {
  const dlEl = document.getElementById("download-speed");
  const ulEl = document.getElementById("upload-speed");
  const pingEl = document.getElementById("ping");
  const jitterEl = document.getElementById("jitter");

  const dlStatusTag = document.getElementById("dl-status-tag");
  const ulStatusTag = document.getElementById("ul-status-tag");
  const phaseLabel = document.getElementById("phase-text-label");

  const segPing = document.getElementById("segment-ping");
  const segDl = document.getElementById("segment-download");
  const segUl = document.getElementById("segment-upload");

  // Numbers
  if (dlEl) dlEl.textContent = formatNum(app.metrics.download);
  if (ulEl) ulEl.textContent = formatNum(app.metrics.upload);
  if (pingEl) pingEl.textContent = app.metrics.ping > 0 ? formatNum(app.metrics.ping) : "--";
  if (jitterEl) jitterEl.textContent = app.metrics.jitter > 0 ? formatNum(app.metrics.jitter) : "--";

  // Phase text & segment indicators
  if (app.phase === 'ping') {
    if (phaseLabel) phaseLabel.textContent = "Measuring Latency & Jitter...";
    if (segPing) segPing.className = "segment-item active";
    if (segDl) segDl.className = "segment-item";
    if (segUl) segUl.className = "segment-item";
    if (dlStatusTag) dlStatusTag.className = "throughput-status-tag";
    if (ulStatusTag) ulStatusTag.className = "throughput-status-tag";
  } else if (app.phase === 'download') {
    if (phaseLabel) phaseLabel.textContent = `Testing Download (${Math.round(app.metrics.dlProgress * 100)}%)...`;
    if (segPing) segPing.className = "segment-item completed";
    if (segDl) segDl.className = "segment-item active";
    if (segUl) segUl.className = "segment-item";
    if (dlStatusTag) {
      dlStatusTag.className = "throughput-status-tag active";
      dlStatusTag.textContent = "Active";
    }
  } else if (app.phase === 'upload') {
    if (phaseLabel) phaseLabel.textContent = `Testing Upload (${Math.round(app.metrics.ulProgress * 100)}%)...`;
    if (segPing) segPing.className = "segment-item completed";
    if (segDl) segDl.className = "segment-item completed";
    if (segUl) segUl.className = "segment-item active-upload";
    if (dlStatusTag) {
      dlStatusTag.className = "throughput-status-tag completed";
      dlStatusTag.textContent = "Complete";
    }
    if (ulStatusTag) {
      ulStatusTag.className = "throughput-status-tag active-upload";
      ulStatusTag.textContent = "Active";
    }
  } else if (app.phase === 'finished') {
    if (phaseLabel) phaseLabel.textContent = "Diagnostic Complete";
    if (segPing) segPing.className = "segment-item completed";
    if (segDl) segDl.className = "segment-item completed";
    if (segUl) segUl.className = "segment-item completed";
    if (dlStatusTag) {
      dlStatusTag.className = "throughput-status-tag completed";
      dlStatusTag.textContent = "Complete";
    }
    if (ulStatusTag) {
      ulStatusTag.className = "throughput-status-tag completed";
      ulStatusTag.textContent = "Complete";
    }
  }
}

/**
 * Finalize Benchmark
 */
function finalizeTest() {
  app.phase = 'finished';
  updateDOMView();
}

/**
 * Real-Time Area Chart Rendering on HTML5 Canvas
 */
function initCanvasCharts() {
  renderChart("download-canvas", [], "#f97316", "rgba(249, 115, 22, 0.15)");
  renderChart("upload-canvas", [], "#8b5cf6", "rgba(139, 92, 246, 0.15)");
}

function renderChart(canvasId, points, strokeColor, fillColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  const w = rect.width;
  const h = rect.height;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  // Background Grid Lines
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  [0.33, 0.66].forEach((r) => {
    ctx.beginPath();
    ctx.moveTo(0, h * r);
    ctx.lineTo(w, h * r);
    ctx.stroke();
  });

  ctx.setLineDash([]);

  // If no points yet, draw a subtle flat baseline
  if (!points || points.length === 0) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(0, h - 8);
    ctx.lineTo(w, h - 8);
    ctx.stroke();
    return;
  }

  // Find max speed in session for dynamic scaling
  const maxSpeed = Math.max(10, ...points.map((p) => p.speed)) * 1.15;

  // Convert points to canvas coordinates
  const coords = points.map((p) => ({
    x: Math.max(0, Math.min(w, p.time * w)),
    y: Math.max(6, Math.min(h - 6, h - (p.speed / maxSpeed) * (h - 14) - 6)),
  }));

  if (coords[0].x > 0) {
    coords.unshift({ x: 0, y: coords[0].y });
  }

  // Draw Filled Area
  ctx.beginPath();
  ctx.moveTo(coords[0].x, h);
  ctx.lineTo(coords[0].x, coords[0].y);

  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(coords[i].x, coords[i].y);
  }

  const lastCoord = coords[coords.length - 1];
  ctx.lineTo(lastCoord.x, h);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, fillColor);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw Stroke Line
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(coords[i].x, coords[i].y);
  }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // Leading Current Position Dot
  if (lastCoord) {
    ctx.beginPath();
    ctx.arc(lastCoord.x, lastCoord.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }
}

/**
 * Reset Telemetry Data & Canvas Waveforms
 */
function resetData() {
  app.downloadPoints = [];
  app.uploadPoints = [];
  app.phase = 'idle';

  app.metrics = {
    download: 0,
    upload: 0,
    ping: 0,
    jitter: 0,
    dlProgress: 0,
    ulProgress: 0,
  };

  const dlEl = document.getElementById("download-speed");
  const ulEl = document.getElementById("upload-speed");
  const pingEl = document.getElementById("ping");
  const jitterEl = document.getElementById("jitter");
  const phaseLabel = document.getElementById("phase-text-label");

  if (dlEl) dlEl.textContent = "0.00";
  if (ulEl) ulEl.textContent = "0.00";
  if (pingEl) pingEl.textContent = "--";
  if (jitterEl) jitterEl.textContent = "--";
  if (phaseLabel) phaseLabel.textContent = "Ready to test";

  ["segment-ping", "segment-download", "segment-upload"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.className = "segment-item";
  });

  const dlStatusTag = document.getElementById("dl-status-tag");
  const ulStatusTag = document.getElementById("ul-status-tag");
  if (dlStatusTag) {
    dlStatusTag.className = "throughput-status-tag";
    dlStatusTag.textContent = "Waiting";
  }
  if (ulStatusTag) {
    ulStatusTag.className = "throughput-status-tag";
    ulStatusTag.textContent = "Waiting";
  }

  initCanvasCharts();
}

/**
 * Load Server List from JSON with fallback
 */
async function loadServerList() {
  try {
    const serverSource =
      typeof globalThis.SPEEDTEST_SERVERS !== "undefined"
        ? globalThis.SPEEDTEST_SERVERS
        : "server-list.json";

    const servers = Array.isArray(serverSource)
      ? serverSource
      : await fetch(serverSource).then((r) => r.json());

    if (servers && Array.isArray(servers) && servers.length > 0) {
      app.servers = servers;

      if (servers.length === 1) {
        selectServer(servers[0]);
        const changeBtn = document.getElementById("server-change-btn");
        if (changeBtn) changeBtn.style.display = "none";
        return true;
      }

      app.speedtest.addTestPoints(servers);
      return await new Promise((resolve) => {
        app.speedtest.selectServer((bestServer) => {
          const alive = app.servers.filter((s) => s.pingT !== -1);
          if (alive.length > 0) app.servers = alive;
          renderServerList(app.servers);

          if (bestServer) {
            selectServer(bestServer);
          } else if (app.servers.length > 0) {
            selectServer(app.servers[0]);
          }
          resolve(true);
        });
      });
    }
  } catch (err) {
    console.warn("Server list fetch failed, using default local server:", err.message);
  }

  // Robust fallback server
  const fallback = {
    name: "local",
    server: "backend",
    dlURL: "garbage.php",
    ulURL: "empty.php",
    pingURL: "empty.php",
    getIpURL: "getIP.php",
    sponsorName: "LibreSpeed Dedicated",
  };
  app.servers = [fallback];
  selectServer(fallback);
  const changeBtn = document.getElementById("server-change-btn");
  if (changeBtn) changeBtn.style.display = "none";
  return true;
}

/**
 * Load settings.json with graceful fallback
 */
async function loadSettings() {
  try {
    const settingsSource =
      typeof globalThis.SPEEDTEST_SETTINGS !== "undefined"
        ? globalThis.SPEEDTEST_SETTINGS
        : "settings.json";
    const res = await fetch(settingsSource);
    if (res.ok) {
      const settings = await res.json();
      if (settings && typeof settings === "object") {
        for (let key in settings) {
          app.speedtest.setParameter(key, settings[key]);
          if (
            key === "telemetry_level" &&
            settings[key] &&
            settings[key] !== "off" &&
            settings[key] !== "disabled" &&
            settings[key] !== "false"
          ) {
            app.telemetryEnabled = true;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Settings error, using defaults:", err.message);
  }
  return true;
}

/**
 * Set Selected Server
 */
function selectServer(server) {
  app.selectedServer = server;
  app.speedtest.setSelectedServer(server);

  const nameEl = document.getElementById("selected-server-name");
  const hostEl = document.getElementById("selected-server-host");
  const locationEl = document.getElementById("spec-server-location");

  if (nameEl) nameEl.textContent = server.name;
  if (hostEl) {
    if (server.sponsorName) {
      hostEl.textContent = `Host: ${server.sponsorName}`;
    } else {
      hostEl.textContent = "Host: LibreSpeed Dedicated";
    }
  }
  if (locationEl) locationEl.textContent = server.name;

  const modal = document.getElementById("server-dialog");
  if (modal && modal.open) modal.close();
}

/**
 * Render Server List inside Modal
 */
function renderServerList(serverList) {
  const container = document.getElementById("server-modal-list");
  if (!container) return;

  container.innerHTML = "";

  if (serverList.length === 0) {
    const li = document.createElement("li");
    li.className = "server-list-item";
    li.textContent = "No servers found";
    container.appendChild(li);
    return;
  }

  serverList.forEach((server) => {
    const li = document.createElement("li");
    li.className = "server-list-item";
    if (app.selectedServer && app.selectedServer.id === server.id) {
      li.classList.add("selected");
    }

    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "server-item-name";
    name.textContent = server.name;
    info.appendChild(name);

    if (server.sponsorName) {
      const sp = document.createElement("div");
      sp.className = "server-item-sponsor";
      sp.textContent = `Sponsored by ${server.sponsorName}`;
      info.appendChild(sp);
    }
    li.appendChild(info);

    if (typeof server.pingT === "number" && server.pingT >= 0) {
      const ping = document.createElement("span");
      ping.className = "server-item-ping";
      ping.textContent = `${Math.round(server.pingT)} ms`;
      li.appendChild(ping);
    }

    li.addEventListener("click", () => selectServer(server));
    container.appendChild(li);
  });
}

/**
 * Update Client IP Metadata
 */
function updateClientMetadata(clientIp) {
  const ipEl = document.getElementById("spec-client-ip");
  const ispEl = document.getElementById("spec-client-isp");

  if (!ipEl) return;

  const parts = clientIp.split(" - ");
  ipEl.textContent = parts[0] || clientIp;

  if (ispEl && parts[1]) {
    ispEl.textContent = parts[1];
  }
}

/**
 * Copy Benchmark Summary to Clipboard
 */
async function handleCopySummary() {
  const { download, upload, ping, jitter } = app.metrics;
  const srv = app.selectedServer ? app.selectedServer.name : "Local";

  const summary = `Internet Speed Benchmark (${srv}): ↓ ${formatNum(download)} Mbps | ↑ ${formatNum(upload)} Mbps | Latency: ${formatNum(ping)} ms | Jitter: ${formatNum(jitter)} ms`;

  try {
    await navigator.clipboard.writeText(summary);
    const btn = document.getElementById("copy-summary-btn");
    if (btn) {
      btn.classList.add("copied");
      btn.innerHTML = `✓ Copied Summary!`;
      setTimeout(() => {
        btn.classList.remove("copied");
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy Summary
        `;
      }, 2500);
    }
  } catch (err) {
    console.error("Clipboard copy failed:", err);
  }
}

/**
 * Copy Share Link in Modal
 */
async function handleCopyShareLink() {
  const img = document.getElementById("results-image");
  if (!img || !img.src) return;

  try {
    await navigator.clipboard.writeText(img.src);
    const btn = document.getElementById("copy-link-btn");
    if (btn) {
      btn.textContent = "Link Copied!";
      setTimeout(() => {
        btn.textContent = "Copy Image Link";
      }, 2500);
    }
  } catch (err) {
    console.error("Copy failed:", err);
  }
}

/**
 * Number Formatting Utility
 */
function formatNum(val) {
  if (val === null || typeof val === "undefined" || isNaN(val)) return "0.00";
  val = Number(val);
  if (val <= 0) return "0.00";
  if (val < 10) return val.toFixed(2);
  if (val < 100) return val.toFixed(1);
  return val.toFixed(0);
}
