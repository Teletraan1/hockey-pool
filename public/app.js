const state = {
  data: null,
  activePoolie: "All",
  query: ""
};

const elements = {
  podium: document.querySelector("#podium"),
  standings: document.querySelector("#standings-body"),
  draftGrid: document.querySelector("#draft-grid"),
  filters: document.querySelector("#poolie-filters"),
  search: document.querySelector("#player-search"),
  empty: document.querySelector("#empty-state")
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "assets.nhle.com"
      ? escapeHtml(url.href)
      : "";
  } catch {
    return "";
  }
}

function initials(name) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value) {
  if (!value) return "Waiting for the first stats refresh";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function relativeFreshness(value) {
  if (!value) return "Stats pending";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value)) / 60_000));
  if (minutes < 2) return "Updated now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

function renderOverview(data) {
  const leader = data.leaderboard[0];
  const topPlayer = [...data.players].sort(
    (a, b) =>
      b.stats.points - a.stats.points ||
      b.stats.goals - a.stats.goals ||
      a.officialName.localeCompare(b.officialName)
  )[0];

  document.querySelector("#scoreboard-season").textContent = data.seasonLabel.replace("20", "").replace("–", " / ");
  document.querySelector("#hero-leader").textContent = leader?.name ?? "Opening faceoff";
  document.querySelector("#hero-points").textContent = leader?.points ?? "0";
  document.querySelector("#hero-player").textContent = topPlayer?.stats.points
    ? `${topPlayer.officialName} · ${topPlayer.stats.points} pts`
    : "Waiting for the opening faceoff…";

  document.querySelector("#updated-at").textContent = `${formatDate(data.generatedAt)} · ${data.source}`;
  document.querySelector("#freshness-label").textContent = relativeFreshness(data.generatedAt);
  document.querySelector("#summary-poolies").textContent = data.summary.poolies;
  document.querySelector("#summary-picks").textContent = data.summary.picks;
  document.querySelector("#summary-points").textContent = data.leaderboard.reduce((sum, poolie) => sum + poolie.points, 0).toLocaleString();
  document.querySelector("#summary-active").textContent = data.summary.playersWithStats;
}

function renderPodium(leaderboard) {
  const labels = ["Pool leader", "Second place", "Third place"];
  elements.podium.innerHTML = leaderboard.slice(0, 3).map((poolie, index) => `
    <article class="podium-card" data-rank="${poolie.rank}">
      <span class="podium-rank">${labels[index]}</span>
      <h3>${escapeHtml(poolie.name)}</h3>
      <div class="podium-totals">
        <span><strong>${poolie.points}</strong>Points</span>
        <span><strong>${poolie.goals}</strong>Goals</span>
        <span><strong>${poolie.assists}</strong>Assists</span>
      </div>
    </article>
  `).join("");
}

function renderStandings(leaderboard) {
  elements.standings.innerHTML = leaderboard.map((poolie) => `
    <tr>
      <td class="rank-cell">${poolie.rank.toString().padStart(2, "0")}</td>
      <td class="poolie-cell"><span>${escapeHtml(initials(poolie.name))}</span>${escapeHtml(poolie.name)}</td>
      <td>${poolie.activePlayers}/${poolie.totalPlayers}</td>
      <td>${poolie.goals}</td>
      <td>${poolie.assists}</td>
      <td class="points-cell">${poolie.points}</td>
    </tr>
  `).join("");
}

function renderFilters(leaderboard) {
  const names = ["All", ...leaderboard.map((poolie) => poolie.name)];
  elements.filters.innerHTML = names.map((name) => `
    <button class="filter-button" type="button" data-poolie="${escapeHtml(name)}" aria-pressed="${name === state.activePoolie}">
      ${escapeHtml(name)}
    </button>
  `).join("");
}

function renderDraft() {
  const query = state.query.trim().toLocaleLowerCase();
  const poolieOrder = state.data.leaderboard.map((poolie) => poolie.name);
  const groups = poolieOrder
    .filter((poolie) => state.activePoolie === "All" || state.activePoolie === poolie)
    .map((poolie) => ({
      poolie,
      players: state.data.players.filter((player) => {
        const matchesPoolie = player.poolie === poolie;
        const haystack = `${player.officialName} ${player.draftName} ${player.poolie} ${player.team ?? ""}`.toLocaleLowerCase();
        return matchesPoolie && (!query || haystack.includes(query));
      })
    }))
    .filter((group) => group.players.length > 0);

  elements.draftGrid.innerHTML = groups.map((group) => rosterCard(group)).join("");
  elements.empty.hidden = groups.length > 0;

  elements.draftGrid.querySelectorAll("img").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
      image.nextElementSibling.hidden = false;
    }, { once: true });
  });
}

function rosterCard(group) {
  const poolie = state.data.leaderboard.find((item) => item.name === group.poolie);
  return `
    <article class="roster-card">
      <header class="roster-header">
        <h3>${escapeHtml(group.poolie)}</h3>
        <span>${poolie.points} points · rank ${poolie.rank}</span>
      </header>
      <ol class="player-list">
        ${group.players.map(playerRow).join("")}
      </ol>
    </article>
  `;
}

function playerRow(player) {
  const imageUrl = safeImageUrl(player.headshot);
  const displayName = player.officialName || player.draftName;
  const hasStats = player.stats.gamesPlayed > 0;
  const meta = hasStats
    ? `${player.team ?? "FA"} · ${player.position ?? "—"} · ${player.stats.goals}G ${player.stats.assists}A`
    : `<span class="awaiting">Awaiting NHL stats</span>`;
  const image = imageUrl
    ? `<img src="${imageUrl}" alt="" loading="lazy" decoding="async"><span class="fallback" hidden>${escapeHtml(initials(displayName))}</span>`
    : `<span class="fallback">${escapeHtml(initials(displayName))}</span>`;

  return `
    <li class="player-row">
      <div class="player-avatar">${image}</div>
      <div class="player-info">
        <strong title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</strong>
        <span class="player-meta">${meta}</span>
      </div>
      <div class="player-score"><strong>${player.stats.points}</strong><span>Pts</span></div>
    </li>
  `;
}

function bindEvents() {
  elements.filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-poolie]");
    if (!button) return;
    state.activePoolie = button.dataset.poolie;
    elements.filters.querySelectorAll("button").forEach((candidate) => {
      candidate.setAttribute("aria-pressed", String(candidate === button));
    });
    renderDraft();
  });

  elements.search.addEventListener("input", () => {
    state.query = elements.search.value;
    renderDraft();
  });
}

function showError(error) {
  console.error(error);
  elements.podium.innerHTML = '<p class="loading-cell">The stats feed is temporarily unavailable.</p>';
  elements.standings.innerHTML = '<tr><td colspan="6" class="loading-cell">Could not load the latest stats. Please try again shortly.</td></tr>';
  elements.draftGrid.innerHTML = "";
  elements.empty.hidden = false;
  elements.empty.textContent = "The draft board could not be loaded.";
  document.querySelector("#freshness-label").textContent = "Feed unavailable";
}

async function boot() {
  try {
    const response = await fetch("data/stats.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
    state.data = await response.json();
    if (!state.data.players.length) {
      throw new Error("The first NHL stats refresh has not completed yet.");
    }
    renderOverview(state.data);
    renderPodium(state.data.leaderboard);
    renderStandings(state.data.leaderboard);
    renderFilters(state.data.leaderboard);
    renderDraft();
    bindEvents();
  } catch (error) {
    showError(error);
  }
}

boot();
