import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPointsHistory,
  currentSeasonId,
  queryForPlayer,
  rankPoolies,
  seasonLabel,
  selectSearchMatch,
  sumNhlSeason
} from "./lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const draftPath = resolve(root, "public/data/draft.json");
const statsPath = resolve(root, "public/data/stats.json");
const historyPath = resolve(root, "public/data/history.json");
const seasonId = Number(process.env.NHL_SEASON ?? currentSeasonId());
const concurrency = Number(process.env.NHL_CONCURRENCY ?? 8);
const timeoutMs = Number(process.env.NHL_TIMEOUT_MS ?? 15_000);

const draft = JSON.parse(await readFile(draftPath, "utf8"));
let previous = { players: [] };
try {
  previous = JSON.parse(await readFile(statsPath, "utf8"));
} catch {
  // The first refresh intentionally starts without a cache.
}

const previousByName = new Map(
  previous.players.map((player) => [player.draftName, player])
);
const picks = draft.poolies.flatMap((poolie) =>
  poolie.picks.map((draftName, index) => ({
    poolie: poolie.name,
    draftName,
    round: index + 1
  }))
);

let successfulLandings = 0;
let resolvedPlayers = 0;

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "hockey-pool-live/1.0" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, 300 * 2 ** (attempt - 1))
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function resolvePlayerId(draftName) {
  const cached = previousByName.get(draftName)?.playerId;
  if (cached) return Number(cached);

  const query = encodeURIComponent(queryForPlayer(draftName));
  const results = await fetchJson(
    `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=15&q=${query}`
  );
  return Number(selectSearchMatch(draftName, results)?.playerId) || null;
}

async function loadPick(pick) {
  const cached = previousByName.get(pick.draftName);
  try {
    const playerId = await resolvePlayerId(pick.draftName);
    if (!playerId) {
      return {
        ...pick,
        playerId: null,
        officialName: queryForPlayer(pick.draftName),
        status: "unmatched",
        stats: emptyStats()
      };
    }

    resolvedPlayers += 1;
    const landing = await fetchJson(
      `https://api-web.nhle.com/v1/player/${playerId}/landing`
    );
    successfulLandings += 1;
    const stats = sumNhlSeason(landing, seasonId);
    return {
      ...pick,
      playerId,
      officialName: [landing.firstName?.default, landing.lastName?.default]
        .filter(Boolean)
        .join(" "),
      team: landing.currentTeamAbbrev ?? null,
      position: landing.position ?? null,
      sweaterNumber: landing.sweaterNumber ?? null,
      headshot: landing.headshot ?? null,
      teamLogo: landing.teamLogo ?? null,
      status: stats.gamesPlayed > 0 ? "active" : "no-stats",
      stats
    };
  } catch (error) {
    console.warn(`Could not refresh ${pick.draftName}: ${error.message}`);
    if (cached) {
      return { ...cached, ...pick, status: "stale" };
    }
    return {
      ...pick,
      playerId: null,
      officialName: queryForPlayer(pick.draftName),
      status: "unavailable",
      stats: emptyStats()
    };
  }
}

function emptyStats() {
  return {
    gamesPlayed: 0,
    goals: 0,
    assists: 0,
    points: 0,
    plusMinus: 0,
    pim: 0,
    powerPlayPoints: 0
  };
}

async function mapConcurrent(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

console.log(`Refreshing ${picks.length} picks for ${seasonLabel(seasonId)}…`);
const players = await mapConcurrent(picks, concurrency, loadPick);

if (successfulLandings === 0 && previous.players.length > 0) {
  throw new Error("The NHL API returned no player records; keeping the last deployment.");
}

const poolies = draft.poolies.map((poolie) => {
  const roster = players.filter((player) => player.poolie === poolie.name);
  return roster.reduce(
    (total, player) => ({
      ...total,
      gamesPlayed: total.gamesPlayed + player.stats.gamesPlayed,
      goals: total.goals + player.stats.goals,
      assists: total.assists + player.stats.assists,
      points: total.points + player.stats.points,
      activePlayers: total.activePlayers + (player.stats.gamesPlayed > 0 ? 1 : 0)
    }),
    {
      name: poolie.name,
      gamesPlayed: 0,
      goals: 0,
      assists: 0,
      points: 0,
      activePlayers: 0,
      totalPlayers: roster.length
    }
  );
});

const leaderboard = rankPoolies(poolies);
const playersWithGames = players.filter(
  (player) => player.playerId && player.stats.gamesPlayed > 0
);
console.log(`Loading game logs for ${playersWithGames.length} active skaters…`);
const gameLogEntries = await mapConcurrent(
  playersWithGames,
  concurrency,
  async (player) => {
    const response = await fetchJson(
      `https://api-web.nhle.com/v1/player/${player.playerId}/game-log/${seasonId}/2`
    );
    return [player.playerId, response.gameLog ?? []];
  }
);
const gameLogsByPlayerId = Object.fromEntries(gameLogEntries);
const generatedAt = new Date();
const history = buildPointsHistory({
  poolieNames: draft.poolies.map((poolie) => poolie.name),
  players,
  gameLogsByPlayerId,
  seasonId,
  generatedAt
});

for (const poolie of leaderboard) {
  const historical = history.series.find((series) => series.name === poolie.name);
  const historicalTotal = historical?.points.at(-1)?.value ?? 0;
  if (historicalTotal !== poolie.points) {
    throw new Error(
      `History mismatch for ${poolie.name}: ${historicalTotal} historical points versus ${poolie.points} current points.`
    );
  }
}

const output = {
  schemaVersion: 1,
  leagueName: draft.leagueName,
  seasonId,
  seasonLabel: seasonLabel(seasonId),
  generatedAt: generatedAt.toISOString(),
  scoring: "1 point per goal or assist",
  source: "NHL public web API",
  summary: {
    poolies: draft.poolies.length,
    picks: players.length,
    resolvedPlayers,
    playersWithStats: players.filter((player) => player.stats.gamesPlayed > 0).length
  },
  leaderboard,
  players
};

const temporaryPath = `${statsPath}.tmp`;
const temporaryHistoryPath = `${historyPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await writeFile(
  temporaryHistoryPath,
  `${JSON.stringify(history, null, 2)}\n`,
  "utf8"
);
await rename(temporaryPath, statsPath);
await rename(temporaryHistoryPath, historyPath);
console.log(
  `Wrote stats and ${history.dates.length} chart dates: ${successfulLandings} refreshed, ${resolvedPlayers} resolved.`
);
