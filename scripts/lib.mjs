export const PLAYER_ALIASES = Object.freeze({
  Barkov: "Aleksander Barkov",
  "David Pastrňák": "David Pastrnak",
  "Gavin Mackenna": "Gavin McKenna",
  "Martin Nečas": "Martin Necas",
  "Ryan Nugent-Hopkins": "Ryan Nugent Hopkins"
});

// NHL search can return retired or same-name players before the intended pick.
// Keep ambiguous pool picks pinned to the league's stable player IDs.
export const PLAYER_ID_OVERRIDES = Object.freeze({
  "Elias Pettersson": 8480012,
  "Jack Hughes": 8481559,
  "Mathew Barzal": 8478445
});

export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

export function queryForPlayer(draftName) {
  return PLAYER_ALIASES[draftName] ?? draftName;
}

export function playerIdFor(draftName) {
  return PLAYER_ID_OVERRIDES[draftName] ?? null;
}

export function selectSearchMatch(draftName, results) {
  const target = normalizeName(queryForPlayer(draftName));
  return results.find((candidate) => normalizeName(candidate.name) === target) ?? null;
}

export function parseEspnInjuries(payload) {
  return (payload?.injuries ?? []).flatMap((team) =>
    (team.injuries ?? []).flatMap((injury) => {
      const playerName = injury.athlete?.displayName;
      if (!playerName) return [];

      return [{
        playerName,
        normalizedName: normalizeName(playerName),
        team: injury.athlete?.team?.abbreviation ?? null,
        status: injury.status ?? injury.type?.description ?? "Injured",
        type: injury.details?.type ?? null,
        returnDate: injury.details?.returnDate ?? null,
        detail: injury.shortComment ?? null,
        updatedAt: injury.date ?? null,
        source: "ESPN"
      }];
    })
  );
}

export function injuryForPlayer(player, injuries) {
  const target = normalizeName(
    player.officialName || queryForPlayer(player.draftName)
  );
  const matches = injuries.filter(
    (injury) => injury.normalizedName === target
  );
  if (matches.length === 0) return null;

  return matches.find((injury) => injury.team === player.team) ??
    (matches.length === 1 ? matches[0] : null);
}

export function currentSeasonId(date = new Date()) {
  const year = date.getUTCFullYear();
  const startsThisYear = date.getUTCMonth() >= 6;
  const start = startsThisYear ? year : year - 1;
  return Number(`${start}${start + 1}`);
}

export function seasonLabel(seasonId) {
  const value = String(seasonId);
  return `${value.slice(0, 4)}–${value.slice(6)}`;
}

export function sumNhlSeason(landing, seasonId) {
  const featured = landing.featuredStats;
  if (
    Number(featured?.season) === Number(seasonId) &&
    featured?.regularSeason?.subSeason
  ) {
    const row = featured.regularSeason.subSeason;
    return {
      gamesPlayed: Number(row.gamesPlayed ?? 0),
      goals: Number(row.goals ?? 0),
      assists: Number(row.assists ?? 0),
      points: Number(row.points ?? 0),
      plusMinus: Number(row.plusMinus ?? 0),
      pim: Number(row.pim ?? 0),
      powerPlayPoints: Number(row.powerPlayPoints ?? 0)
    };
  }

  const rows = (landing.seasonTotals ?? []).filter(
    (row) =>
      Number(row.season) === Number(seasonId) &&
      Number(row.gameTypeId) === 2 &&
      row.leagueAbbrev === "NHL"
  );

  return rows.reduce(
    (total, row) => ({
      gamesPlayed: total.gamesPlayed + Number(row.gamesPlayed ?? 0),
      goals: total.goals + Number(row.goals ?? 0),
      assists: total.assists + Number(row.assists ?? 0),
      points: total.points + Number(row.points ?? 0),
      plusMinus: total.plusMinus + Number(row.plusMinus ?? 0),
      pim: total.pim + Number(row.pim ?? 0),
      powerPlayPoints:
        total.powerPlayPoints + Number(row.powerPlayPoints ?? 0)
    }),
    {
      gamesPlayed: 0,
      goals: 0,
      assists: 0,
      points: 0,
      plusMinus: 0,
      pim: 0,
      powerPlayPoints: 0
    }
  );
}

export function rankPoolies(poolies) {
  const sorted = [...poolies].sort(
    (a, b) =>
      b.points - a.points ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.name.localeCompare(b.name)
  );

  let lastScore = null;
  let lastRank = 0;
  return sorted.map((poolie, index) => {
    const score = `${poolie.points}:${poolie.goals}:${poolie.assists}`;
    if (score !== lastScore) {
      lastRank = index + 1;
      lastScore = score;
    }
    return { ...poolie, rank: lastRank };
  });
}

export function buildPointsHistory({
  poolieNames,
  players,
  gameLogsByPlayerId,
  seasonId,
  generatedAt = new Date()
}) {
  const gameDates = new Set();
  for (const games of Object.values(gameLogsByPlayerId)) {
    for (const game of games) {
      if (game.gameDate) gameDates.add(game.gameDate);
    }
  }

  const sortedGameDates = [...gameDates].sort();
  const today = generatedAt.toISOString().slice(0, 10);
  const firstGameDate = sortedGameDates[0] ?? today;
  const openingDate = new Date(`${firstGameDate}T00:00:00Z`);
  openingDate.setUTCDate(openingDate.getUTCDate() - 1);
  const dates = [
    ...new Set([
      openingDate.toISOString().slice(0, 10),
      ...sortedGameDates,
      today
    ])
  ].sort();

  const series = poolieNames.map((poolie) => {
    const dailyPoints = new Map();
    const roster = players.filter((player) => player.poolie === poolie);
    for (const player of roster) {
      const games = gameLogsByPlayerId[player.playerId] ?? [];
      for (const game of games) {
        dailyPoints.set(
          game.gameDate,
          (dailyPoints.get(game.gameDate) ?? 0) + Number(game.points ?? 0)
        );
      }
    }

    let runningTotal = 0;
    return {
      name: poolie,
      points: dates.map((date) => {
        runningTotal += dailyPoints.get(date) ?? 0;
        return { date, value: runningTotal };
      })
    };
  });

  return {
    schemaVersion: 1,
    seasonId,
    generatedAt: generatedAt.toISOString(),
    dates,
    series
  };
}
