const express = require("express");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json());

const readJSON = (filename) => {
  const filePath = path.join(__dirname, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

app.get("/api/summary", (req, res) => {
  try {
    const summary = readJSON("summary.json");
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: "Could not read summary data" });
  }
});

app.get("/api/calls", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    res.json({ total: calls.length, calls });
  } catch (err) {
    res.status(500).json({ error: "Could not read call data" });
  }
});

app.get("/api/calls/deflected", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    const deflected = calls.filter((c) => c.selfServed);
    res.json({ total: deflected.length, calls: deflected });
  } catch (err) {
    res.status(500).json({ error: "Could not filter deflected calls" });
  }
});

app.get("/api/calls/transferred", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    const transferred = calls.filter((c) => !c.selfServed);
    res.json({ total: transferred.length, calls: transferred });
  } catch (err) {
    res.status(500).json({ error: "Could not filter transferred calls" });
  }
});

app.get("/api/backlog", (req, res) => {
  try {
    const summary = readJSON("summary.json");
    res.json({ total: summary.topBacklogItems.length, items: summary.topBacklogItems });
  } catch (err) {
    res.status(500).json({ error: "Could not read backlog data" });
  }
});

app.get("/api/ai-recommendations", async (req, res) => {
  try {
    const summary = readJSON("summary.json");
    const calls = readJSON("callData.json");

    const prompt = `You are an AI Product Owner assistant specializing in credit union contact center optimization.

Here is the current IVR performance data:
- Total Calls: ${summary.totalCalls}
- AI Self-Service Rate: ${summary.deflectionRate}
- Agent Transfers: ${summary.agentTransferCount}
- Sentiment Breakdown: ${JSON.stringify(summary.sentimentBreakdown)}
- Call Type Breakdown: ${JSON.stringify(summary.callTypeBreakdown)}

Top recurring agent transfer reasons:
${summary.topBacklogItems.map((i, n) => `${n + 1}. ${i.recommendation} (${i.frequency} occurrences)`).join("\n")}

Based on this data, provide:
1. Three specific product backlog items ranked by business impact
2. One quick win that could be implemented in the next sprint
3. A recommended KPI target for next quarter's deflection rate

Format your response clearly with headers for each section.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    res.json({
      generatedAt: new Date().toISOString(),
      dataSnapshot: {
        totalCalls: summary.totalCalls,
        deflectionRate: summary.deflectionRate,
        agentTransfers: summary.agentTransferCount,
      },
      aiRecommendations: message.content[0].text,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI recommendation failed", detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ IVR Analytics API running at http://localhost:${PORT}`);
  console.log(`📊 Summary:         http://localhost:${PORT}/api/summary`);
  console.log(`📞 All Calls:       http://localhost:${PORT}/api/calls`);
  console.log(`🤖 Deflected:       http://localhost:${PORT}/api/calls/deflected`);
  console.log(`👤 Transferred:     http://localhost:${PORT}/api/calls/transferred`);
  console.log(`🏆 Backlog:         http://localhost:${PORT}/api/backlog`);
  console.log(`🧠 AI Recommend:    http://localhost:${PORT}/api/ai-recommendations`);
});