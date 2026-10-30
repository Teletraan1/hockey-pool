const state = {
  data: null,
  history: null,
  activePoolie: "All",
  query: "",
  chartMode: "total",
  hiddenSeries: new Set()
};

const elements = {
  podium: document.querySelector("#podium"),
  standings: document.querySelector("#standings-body"),
  draftGrid: document.querySelector("#draft-grid"),
  filters: document.querySelector("#poolie-filters"),
  search: document.querySelector("#player-search"),
  empty: document.querySelector("#empty-state"),
  chart: document.querySelector("#points-chart"),
  chartLegend: document.querySelector("#chart-legend"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  chartMode: document.querySelector("#chart-mode")
};

const chartColors = [
  "#ef3f4f",
  "#2d9ec7",
  "#7657d8",
  "#16a085",
  "#e39a19",
  "#a44b9b",
  "#31546b",
  "#e66b36",
  "#58a84f",
  "#d3547d"
];

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

function renderPointsChart() {
  if (!state.history?.series?.length) {
    elements.chart.innerHTML = '<div class="chart-loading">Season history is temporarily unavailable.</div>';
    return;
  }

  const { dates, series: cumulativeSeries } = state.history;
  const leaderName = state.data.leaderboard[0]?.name;
  const leaderSeries = cumulativeSeries.find((item) => item.name === leaderName);
  const isRelative = state.chartMode === "leader" && leaderSeries;
  const series = isRelative
    ? cumulativeSeries.map((item) => ({
        ...item,
        points: item.points.map((point, index) => ({
          ...point,
          value: point.value - (leaderSeries.points[index]?.value ?? 0)
        }))
      }))
    : cumulativeSeries;
  const width = 1000;
  const height = 430;
  const margin = { top: 22, right: 28, bottom: 48, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const times = dates.map((date) => new Date(`${date}T12:00:00Z`).getTime());
  const minTime = times[0];
  const maxTime = times.at(-1);
  const values = series.flatMap((item) =>
    item.points.map((point) => point.value)
  );
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const roughTick = Math.max(1, (rawMax - rawMin) / 5);
  const magnitude = 10 ** Math.floor(Math.log10(roughTick));
  const normalizedTick = roughTick / magnitude;
  const tickFactor = normalizedTick <= 1 ? 1 : normalizedTick <= 2 ? 2 : normalizedTick <= 5 ? 5 : 10;
  const tickSize = tickFactor * magnitude;
  let yMin = Math.floor(rawMin / tickSize) * tickSize;
  let yMax = Math.ceil(rawMax / tickSize) * tickSize;
  if (yMin === yMax) {
    yMin = isRelative ? -tickSize : 0;
    yMax = tickSize;
  }
  const x = (time) =>
    margin.left +
    ((time - minTime) / Math.max(1, maxTime - minTime)) * plotWidth;
  const y = (value) =>
    margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;
  const formatChartValue = (value) => {
    if (!isRelative || value === 0) return String(value);
    return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
  };
  const colorByName = new Map(
    series.map((item, index) => [item.name, chartColors[index % chartColors.length]])
  );

  const yTicks = [];
  for (let value = yMin; value <= yMax + tickSize / 2; value += tickSize) {
    yTicks.push(Math.round(value * 100) / 100);
  }
  const yGrid = yTicks.map((value) => {
    const position = y(value);
    return `
      <line class="chart-grid-line ${value === 0 ? "major" : ""}" x1="${margin.left}" x2="${width - margin.right}" y1="${position}" y2="${position}"></line>
      <text class="chart-axis-label" x="${margin.left - 11}" y="${position + 4}" text-anchor="end">${formatChartValue(value)}</text>
    `;
  }).join("");

  const tickIndexes = [...new Set(Array.from({ length: 6 }, (_, index) =>
    Math.round((dates.length - 1) * (index / 5))
  ))];
  const xGrid = tickIndexes.map((index) => {
    const position = x(times[index]);
    const label = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric"
    }).format(new Date(`${dates[index]}T12:00:00Z`));
    return `
      <line class="chart-grid-line" x1="${position}" x2="${position}" y1="${margin.top}" y2="${height - margin.bottom}"></line>
      <text class="chart-axis-label" x="${position}" y="${height - 18}" text-anchor="middle">${escapeHtml(label)}</text>
    `;
  }).join("");

  const paths = series.map((item) => {
    const hidden = state.hiddenSeries.has(item.name);
    const path = item.points.map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${x(times[index]).toFixed(2)},${y(point.value).toFixed(2)}`;
    }).join(" ");
    const last = item.points.at(-1);
    const color = colorByName.get(item.name);
    return `
      <g data-chart-series="${escapeHtml(item.name)}" style="--series-color:${color}" ${hidden ? "hidden" : ""}>
        <path class="chart-series" d="${path}"></path>
        <circle class="chart-end-dot" cx="${x(times.at(-1))}" cy="${y(last.value)}" r="4"></circle>
      </g>
    `;
  }).join("");

  elements.chart.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${yGrid}
      ${xGrid}
      ${paths}
      <line class="chart-crosshair" id="chart-crosshair" x1="0" x2="0" y1="${margin.top}" y2="${height - margin.bottom}" hidden></line>
      <rect class="chart-hit-area" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>
    </svg>
  `;

  const ordered = state.data.leaderboard.map((poolie) => {
    const item = series.find((candidate) => candidate.name === poolie.name);
    return { ...item, latest: item?.points.at(-1)?.value ?? 0 };
  });
  elements.chartLegend.innerHTML = ordered.map((item) => {
    const visible = !state.hiddenSeries.has(item.name);
    return `
      <button class="legend-button" type="button" data-series-name="${escapeHtml(item.name)}" aria-pressed="${visible}" style="--series-color:${colorByName.get(item.name)}">
        <span class="legend-swatch" aria-hidden="true"></span>
        ${escapeHtml(item.name)} <strong>${formatChartValue(item.latest)}</strong>
      </button>
    `;
  }).join("");

  const startLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
    .format(new Date(`${dates[0]}T12:00:00Z`));
  const endLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
    .format(new Date(`${dates.at(-1)}T12:00:00Z`));
  document.querySelector("#chart-range").textContent = `${startLabel} – ${endLabel}`;
  const leader = ordered[0];
  document.querySelector("#chart-title").textContent = isRelative
    ? "Difference from leader"
    : "Points accumulated";
  document.querySelector("#chart-description").textContent = isRelative
    ? `${leaderName} is the zero baseline. Every other line shows its points difference against the current leader.`
    : "Follow the race from opening night to today. Select a poolie to show or hide their line.";
  document.querySelector("#chart-key-label").textContent = isRelative
    ? `${leaderName} baseline`
    : "Cumulative pool points";
  document.querySelector("#chart-measure").textContent = isRelative
    ? `Difference vs ${leaderName}`
    : "Goals + assists";
  elements.chart.setAttribute(
    "aria-label",
    isRelative
      ? `Pool points difference from current leader ${leaderName}, from ${startLabel} to ${endLabel}. ${leaderName} is the zero baseline.`
      : `Cumulative pool points from ${startLabel} to ${endLabel}. ${leader.name} leads with ${leader.latest} points.`
  );

  const svg = elements.chart.querySelector("svg");
  const crosshair = svg.querySelector("#chart-crosshair");
  svg.addEventListener("pointermove", (event) => {
    const bounds = svg.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - margin.left) / plotWidth));
    const targetTime = minTime + ratio * (maxTime - minTime);
    const index = times.reduce((closest, time, candidate) =>
      Math.abs(time - targetTime) < Math.abs(times[closest] - targetTime)
        ? candidate
        : closest
    , 0);
    const crosshairX = x(times[index]);
    crosshair.hidden = false;
    crosshair.setAttribute("x1", crosshairX);
    crosshair.setAttribute("x2", crosshairX);

    const visibleRows = series
      .filter((item) => !state.hiddenSeries.has(item.name))
      .map((item) => ({ name: item.name, value: item.points[index].value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const dateLabel = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium"
    }).format(new Date(`${dates[index]}T12:00:00Z`));
    elements.chartTooltip.innerHTML = `
      <time>${escapeHtml(dateLabel)}</time>
      ${visibleRows.map((row) => `
        <div class="chart-tooltip-row" style="--series-color:${colorByName.get(row.name)}">
          <i aria-hidden="true"></i><span>${escapeHtml(row.name)}</span><strong>${formatChartValue(row.value)}</strong>
        </div>
      `).join("")}
    `;
    elements.chartTooltip.hidden = false;
    elements.chartTooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - 225)}px`;
    elements.chartTooltip.style.top = `${Math.max(10, Math.min(event.clientY - 35, window.innerHeight - 290))}px`;
  });
  svg.addEventListener("pointerleave", () => {
    crosshair.hidden = true;
    elements.chartTooltip.hidden = true;
  });
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
    : player.playerId
      ? `${player.team ?? "NHL"} · ${player.position ?? "—"} · 0 GP this season`
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

  elements.chartLegend.addEventListener("click", (event) => {
    const button = event.target.closest("[data-series-name]");
    if (!button) return;
    const name = button.dataset.seriesName;
    if (state.hiddenSeries.has(name)) state.hiddenSeries.delete(name);
    else state.hiddenSeries.add(name);
    renderPointsChart();
  });

  elements.chartMode.addEventListener("change", () => {
    state.chartMode = elements.chartMode.value;
    elements.chartTooltip.hidden = true;
    renderPointsChart();
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
    const [statsResponse, historyResponse] = await Promise.all([
      fetch("data/stats.json", { cache: "no-store" }),
      fetch("data/history.json", { cache: "no-store" })
    ]);
    if (!statsResponse.ok) throw new Error(`Stats request failed: ${statsResponse.status}`);
    state.data = await statsResponse.json();
    if (historyResponse.ok) state.history = await historyResponse.json();
    if (!state.data.players.length) {
      throw new Error("The first NHL stats refresh has not completed yet.");
    }
    renderOverview(state.data);
    renderPodium(state.data.leaderboard);
    renderStandings(state.data.leaderboard);
    renderPointsChart();
    renderFilters(state.data.leaderboard);
    renderDraft();
    bindEvents();
  } catch (error) {
    showError(error);
  }
}

boot();
