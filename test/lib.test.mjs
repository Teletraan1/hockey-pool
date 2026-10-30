import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPointsHistory,
  currentSeasonId,
  normalizeName,
  playerIdFor,
  rankPoolies,
  selectSearchMatch,
  sumNhlSeason
} from "../scripts/lib.mjs";

test("normalizes accents and punctuation", () => {
  assert.equal(normalizeName("Tim Stützle"), "tim stutzle");
  assert.equal(normalizeName("J.T. Miller"), "j t miller");
});

test("selects exact normalized names and aliases", () => {
  const results = [
    { playerId: "1", name: "Aleksander Barkov" },
    { playerId: "2", name: "Alexander Barabanov" }
  ];
  assert.equal(selectSearchMatch("Barkov", results)?.playerId, "1");
});

test("pins ambiguous player names to the intended NHL IDs", () => {
  assert.equal(playerIdFor("Elias Pettersson"), 8480012);
  assert.equal(playerIdFor("Jack Hughes"), 8481559);
  assert.equal(playerIdFor("Mathew Barzal"), 8478445);
  assert.equal(playerIdFor("Connor McDavid"), null);
});

test("selects the NHL season around July", () => {
  assert.equal(currentSeasonId(new Date("2026-06-30T12:00:00Z")), 20252026);
  assert.equal(currentSeasonId(new Date("2026-07-01T12:00:00Z")), 20262027);
});

test("sums split NHL season rows and ignores other leagues", () => {
  const stats = sumNhlSeason(
    {
      seasonTotals: [
        { season: 20262027, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 2, goals: 1, assists: 3, points: 4 },
        { season: 20262027, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 3, goals: 2, assists: 1, points: 3 },
        { season: 20262027, gameTypeId: 2, leagueAbbrev: "AHL", gamesPlayed: 8, goals: 9, assists: 9, points: 18 }
      ]
    },
    20262027
  );
  assert.deepEqual(
    { gamesPlayed: stats.gamesPlayed, goals: stats.goals, assists: stats.assists, points: stats.points },
    { gamesPlayed: 5, goals: 3, assists: 4, points: 7 }
  );
});

test("prefers the current featured NHL total", () => {
  const stats = sumNhlSeason(
    {
      featuredStats: {
        season: 20262027,
        regularSeason: {
          subSeason: { gamesPlayed: 4, goals: 2, assists: 5, points: 7 }
        }
      },
      seasonTotals: [
        { season: 20262027, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 2, points: 3 },
        { season: 20262027, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 2, points: 4 }
      ]
    },
    20262027
  );
  assert.equal(stats.points, 7);
  assert.equal(stats.gamesPlayed, 4);
});

test("uses competition ranking for tied totals", () => {
  const ranked = rankPoolies([
    { name: "A", points: 10, goals: 5, assists: 5 },
    { name: "B", points: 10, goals: 5, assists: 5 },
    { name: "C", points: 8, goals: 4, assists: 4 }
  ]);
  assert.deepEqual(ranked.map(({ name, rank }) => [name, rank]), [["A", 1], ["B", 1], ["C", 3]]);
});

test("builds cumulative points history by poolie and date", () => {
  const history = buildPointsHistory({
    poolieNames: ["A", "B"],
    players: [
      { poolie: "A", playerId: 1 },
      { poolie: "A", playerId: 2 },
      { poolie: "B", playerId: 3 }
    ],
    gameLogsByPlayerId: {
      1: [
        { gameDate: "2026-10-10", points: 2 },
        { gameDate: "2026-10-12", points: 1 }
      ],
      2: [{ gameDate: "2026-10-10", points: 1 }],
      3: [{ gameDate: "2026-10-11", points: 4 }]
    },
    seasonId: 20262027,
    generatedAt: new Date("2026-10-13T12:00:00Z")
  });

  assert.deepEqual(history.dates, [
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
    "2026-10-12",
    "2026-10-13"
  ]);
  assert.deepEqual(
    history.series[0].points.map((point) => point.value),
    [0, 3, 3, 4, 4]
  );
  assert.deepEqual(
    history.series[1].points.map((point) => point.value),
    [0, 0, 4, 4, 4]
  );
});
