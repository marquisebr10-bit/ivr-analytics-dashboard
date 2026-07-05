const express = require("express");
const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;

// ── WebSocket Connection ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("📡 Dashboard connected:", socket.id);

  // Send current summary immediately on connect
  try {
    const summary = readJSON("summary.json");
    socket.emit("summaryUpdate", summary);
  } catch (err) {
    console.error("Could not send initial summary:", err);
  }

  socket.on("disconnect", () => {
    console.log("📡 Dashboard disconnected:", socket.id);
  });
});

// ── Helper to broadcast updates to all connected dashboards ──────────────────
const broadcastUpdate = () => {
  try {
    const summary = readJSON("summary.json");
    io.emit("summaryUpdate", summary);
    console.log("📡 Broadcasted live update to all dashboards");
  } catch (err) {
    console.error("Broadcast failed:", err);
  }
};

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
// ── Real-Time: Generate new call and broadcast to all dashboards ──────────────
app.post("/api/calls/new", (req, res) => {
  try {
    const calls = readJSON("callData.json");
    const summary = readJSON("summary.json");

    const CALL_TYPES = [
      "Balance Inquiry", "Loan Information", "Dispute Resolution",
      "Account Maintenance", "Payment Processing", "Card Services",
      "Fraud Alert", "General Inquiry",
    ];

    const BACKLOG_SUGGESTIONS = {
      "Balance Inquiry": "Add voice-enabled balance confirmation to reduce agent transfers.",
      "Loan Information": "Build an AI loan eligibility pre-screener in IVR to deflect 30%+ of calls.",
      "Dispute Resolution": "Create guided dispute intake flow to collect info before agent handoff.",
      "Account Maintenance": "Automate address/email update flows — high self-service potential.",
      "Payment Processing": "Expand IVR payment options to include scheduled payments.",
      "Card Services": "Add instant card lock/unlock to IVR — members expect self-service here.",
      "Fraud Alert": "Implement AI-driven fraud confirmation flow to reduce live agent load.",
      "General Inquiry": "Build dynamic FAQ bot trained on top 20 member questions.",
    };

    const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const callType = randomFrom(CALL_TYPES);
    const resolution = randomFrom(["AI Self-Service", "Agent Transfer"]);
    const sentiment = randomFrom(["Positive", "Neutral", "Negative"]);
    const selfServed = resolution === "AI Self-Service";

    const newCall = {
      callId: `CU-${String(calls.length + 1).padStart(4, "0")}`,
      date: new Date().toISOString().split("T")[0],
      callType,
      resolution,
      selfServed,
      durationSeconds: randomInt(30, 480),
      sentimentScore: sentiment,
      memberSatisfied: sentiment !== "Negative",
      backlogRecommendation: selfServed ? null : BACKLOG_SUGGESTIONS[callType],
    };

    // Add to calls array
    calls.push(newCall);
    fs.writeFileSync("callData.json", JSON.stringify(calls, null, 2));

    // Recalculate summary
    const totalCalls = calls.length;
    const selfServedCount = calls.filter((c) => c.selfServed).length;
    const deflectionRate = ((selfServedCount / totalCalls) * 100).toFixed(1);

    const sentimentBreakdown = ["Positive", "Neutral", "Negative"].reduce((acc, s) => {
      acc[s] = calls.filter((c) => c.sentimentScore === s).length;
      return acc;
    }, {});

    const callTypeBreakdown = CALL_TYPES.reduce((acc, t) => {
      const typeRecords = calls.filter((r) => r.callType === t);
      acc[t] = {
        total: typeRecords.length,
        selfServed: typeRecords.filter((r) => r.selfServed).length,
        agentTransfer: typeRecords.filter((r) => !r.selfServed).length,
      };
      return acc;
    }, {});

    const topBacklogItems = Object.entries(
      calls
        .filter((r) => r.backlogRecommendation)
        .reduce((acc, r) => {
          acc[r.backlogRecommendation] = (acc[r.backlogRecommendation] || 0) + 1;
          return acc;
        }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([recommendation, frequency]) => ({ recommendation, frequency }));

    const newSummary = {
      generatedAt: new Date().toISOString(),
      totalCalls,
      selfServedCount,
      agentTransferCount: totalCalls - selfServedCount,
      deflectionRate: `${deflectionRate}%`,
      sentimentBreakdown,
      callTypeBreakdown,
      topBacklogItems,
    };

    fs.writeFileSync("summary.json", JSON.stringify(newSummary, null, 2));

    // Broadcast live update to all connected dashboards
    io.emit("summaryUpdate", newSummary);
    io.emit("newCall", newCall);

    res.json({ success: true, newCall, summary: newSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate new call" });
  }
});
// 8. AI Chat Interface — ask questions about your IVR data
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    const summary = readJSON("summary.json");
    const calls = readJSON("callData.json");

    const systemPrompt = `You are an expert IVR analytics assistant for a credit union contact center. 
You have access to the following real-time IVR performance data:

Total Calls: ${summary.totalCalls}
Deflection Rate: ${summary.deflectionRate}
AI Self-Served: ${summary.selfServedCount}
Agent Transfers: ${summary.agentTransferCount}
Sentiment Breakdown: ${JSON.stringify(summary.sentimentBreakdown)}
Call Type Breakdown: ${JSON.stringify(summary.callTypeBreakdown)}
Top Backlog Items: ${JSON.stringify(summary.topBacklogItems)}

Answer questions about this data concisely and professionally. 
Provide specific numbers and actionable recommendations when possible.
Keep responses under 150 words unless asked for detail.`;

    const messages = [
      ...(history || []),
      { role: "user", content: message }
    ];

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    res.json({
      reply: response.content[0].text,
      history: [
        ...(history || []),
        { role: "user", content: message },
        { role: "assistant", content: response.content[0].text }
      ]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Chat failed", detail: err.message });
  }
});
server.listen(PORT, () => {
  console.log(`✅ IVR Analytics API running at http://localhost:${PORT}`);
  console.log(`📊 Summary:         http://localhost:${PORT}/api/summary`);
  console.log(`📞 All Calls:       http://localhost:${PORT}/api/calls`);
  console.log(`🤖 Deflected:       http://localhost:${PORT}/api/calls/deflected`);
  console.log(`👤 Transferred:     http://localhost:${PORT}/api/calls/transferred`);
  console.log(`🏆 Backlog:         http://localhost:${PORT}/api/backlog`);
  console.log(`🧠 AI Recommend:    http://localhost:${PORT}/api/ai-recommendations`);
});