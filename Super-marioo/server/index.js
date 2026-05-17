const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, "..", "data");
const SCORES_FILE = path.join(DATA_DIR, "highscores.json");
const MAX_SCORES = 20;

const app = express();
app.use(cors());
app.use(express.json({ limit: "16kb" }));

async function ensureScoresFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SCORES_FILE);
  } catch {
    await fs.writeFile(SCORES_FILE, "[]", "utf8");
  }
}

async function readScores() {
  await ensureScoresFile();
  const raw = await fs.readFile(SCORES_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeScores(scores) {
  await ensureScoresFile();
  await fs.writeFile(SCORES_FILE, JSON.stringify(scores, null, 2), "utf8");
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "supermario-api" });
});

app.get("/api/scores", async (_req, res) => {
  try {
    const scores = await readScores();
    scores.sort((a, b) => b.score - a.score);
    res.json({ scores: scores.slice(0, MAX_SCORES) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not read scores" });
  }
});

app.post("/api/scores", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").trim().slice(0, 24) || "Player";
    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 9_999_999) {
      return res.status(400).json({ error: "Invalid score" });
    }

    const scores = await readScores();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name,
      score: Math.floor(score),
      at: new Date().toISOString(),
    };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const trimmed = scores.slice(0, MAX_SCORES);
    await writeScores(trimmed);

    const rank = trimmed.findIndex((s) => s.id === entry.id) + 1;
    res.status(201).json({ entry, rank, leaderboard: trimmed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save score" });
  }
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

ensureScoresFile()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Super Mario server at http://localhost:${PORT}`);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Close the other program or run with a different port, e.g.:\n` +
            `  PowerShell:  $env:PORT=3001; npm start\n` +
            `  cmd.exe:       set PORT=3001 && npm start`
        );
        process.exit(1);
      }
      throw err;
    });
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
