import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const required = [
  "public/index.html",
  "public/favicon.svg",
  "public/styles.css",
  "public/app.js",
  "public/data/draft.json",
  "public/data/history.json",
  "public/data/stats.json"
];

await Promise.all(required.map((path) => access(resolve(path))));

const draft = JSON.parse(await readFile("public/data/draft.json", "utf8"));
const stats = JSON.parse(await readFile("public/data/stats.json", "utf8"));
const history = JSON.parse(await readFile("public/data/history.json", "utf8"));
const html = await readFile("public/index.html", "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(draft.poolies.length === 10, "Expected 10 poolies in the draft.");
assert(
  draft.poolies.every((poolie) => poolie.picks.length === 16),
  "Every poolie must have exactly 16 picks."
);
assert(
  new Set(draft.poolies.flatMap((poolie) => poolie.picks)).size === 160,
  "All 160 draft picks must be unique."
);
assert(stats.players.length === 160, "The stats snapshot must contain 160 players.");
assert(stats.leaderboard.length === 10, "The leaderboard must contain 10 poolies.");
assert(
  new Set(stats.players.map((player) => player.draftName)).size === 160,
  "The stats snapshot must preserve all unique draft names."
);
const expectedPlayerIds = new Map([
  ["Elias Pettersson", 8480012],
  ["Jack Hughes", 8481559],
  ["Mathew Barzal", 8478445]
]);
for (const [draftName, playerId] of expectedPlayerIds) {
  const player = stats.players.find((item) => item.draftName === draftName);
  assert(
    player?.playerId === playerId,
    `${draftName} must resolve to NHL player ${playerId}.`
  );
}
assert(history.series.length === 10, "The history must contain 10 poolie series.");
assert(history.dates.length >= 2, "The history must contain at least two dates.");
for (const poolie of stats.leaderboard) {
  const series = history.series.find((item) => item.name === poolie.name);
  assert(series, `History is missing ${poolie.name}.`);
  assert(
    series.points.at(-1)?.value === poolie.points,
    `History total does not match the leaderboard for ${poolie.name}.`
  );
}
assert(html.includes("styles.css"), "index.html must load styles.css.");
assert(html.includes("app.js"), "index.html must load app.js.");
assert(html.includes('id="leaderboard"'), "The page needs a leaderboard landmark.");
assert(html.includes('id="draft"'), "The page needs a draft-board landmark.");
assert(html.includes('id="points-chart"'), "The page needs a points chart landmark.");
assert(html.includes('id="chart-mode"'), "The points chart needs a plot selector.");

console.log("Validated 10 poolies, 160 unique picks, stats, and web assets.");
