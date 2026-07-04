const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Middleware to handle CORS so the dashboard can talk to the API
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());

// ── Helper to read data files ─────────────────────────────────────────────────
const readJSON = (filename) => {
  const filePath = path.join(__dirname, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

// ── Routes ────────────────────────────────────────────────────────────────────

// 1. Health check — confirms the server is running
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "IVR Analytics API is running",
    endpoints: [
      "/api/summary",
      "/api/calls",
      "/api/calls/deflected",
      "/api/calls/transferred",
      "/api/backlog",
    ],
  });
});

// 2. Summary stats — deflection rate, sentiment, call type breakdown
app.get("/api/summary", (req, res) => {
  try {
    const summary = readJSON("summary.json");
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Could not read summary data" });
  }
});

// 3. All call records
app.get("/api/calls", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    res.json({
      total: calls.length,
      calls,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not read call data" });
  }
});

// 4. Only AI self-served calls
app.get("/api/calls/deflected", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    const deflected = calls.filter((c) => c.selfServed);
    res.json({
      total: deflected.length,
      calls: deflected,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not filter deflected calls" });
  }
});

// 5. Only agent transfer calls
app.get("/api/calls/transferred", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    const transferred = calls.filter((c) => !c.selfServed);
    res.json({
      total: transferred.length,
      calls: transferred,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not filter transferred calls" });
  }
});

// 6. Top backlog recommendations ranked by frequency
app.get("/api/backlog", (req, res) => {
  try {
    const summary = readJSON("summary.json");
    res.json({
      total: summary.topBacklogItems.length,
      items: summary.topBacklogItems,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not read backlog data" });
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ IVR Analytics API running at http://localhost:${PORT}`);
  console.log(`📊 Summary:     http://localhost:${PORT}/api/summary`);
  console.log(`📞 All Calls:   http://localhost:${PORT}/api/calls`);
  console.log(`🤖 Deflected:   http://localhost:${PORT}/api/calls/deflected`);
  console.log(`👤 Transferred: http://localhost:${PORT}/api/calls/transferred`);
  console.log(`🏆 Backlog:     http://localhost:${PORT}/api/backlog`);
});