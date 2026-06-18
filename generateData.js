const fs = require("fs");

const NUM_RECORDS = 100;

const CALL_TYPES = [
  "Balance Inquiry","Loan Information","Dispute Resolution",
  "Account Maintenance","Payment Processing","Card Services",
  "Fraud Alert","General Inquiry",
];

const SENTIMENTS = ["Positive", "Neutral", "Negative"];
const RESOLUTION_TYPES = ["AI Self-Service", "Agent Transfer"];

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
const randomDate = () => {
  const start = new Date("2024-01-01");
  const end = new Date("2024-12-31");
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split("T")[0];
};
const generateCallId = (index) => `CU-${String(index + 1).padStart(4, "0")}`;

const records = Array.from({ length: NUM_RECORDS }, (_, i) => {
  const callType = randomFrom(CALL_TYPES);
  const resolution = randomFrom(RESOLUTION_TYPES);
  const sentiment = randomFrom(SENTIMENTS);
  const duration = randomInt(30, 480);
  const selfServed = resolution === "AI Self-Service";
  return {
    callId: generateCallId(i),
    date: randomDate(),
    callType,
    resolution,
    selfServed,
    durationSeconds: duration,
    sentimentScore: sentiment,
    memberSatisfied: sentiment !== "Negative",
    backlogRecommendation: selfServed ? null : BACKLOG_SUGGESTIONS[callType],
  };
});

const totalCalls = records.length;
const selfServedCount = records.filter((r) => r.selfServed).length;
const deflectionRate = ((selfServedCount / totalCalls) * 100).toFixed(1);

const sentimentBreakdown = ["Positive","Neutral","Negative"].reduce((acc, s) => {
  acc[s] = records.filter((r) => r.sentimentScore === s).length;
  return acc;
}, {});

const callTypeBreakdown = CALL_TYPES.reduce((acc, t) => {
  const typeRecords = records.filter((r) => r.callType === t);
  acc[t] = {
    total: typeRecords.length,
    selfServed: typeRecords.filter((r) => r.selfServed).length,
    agentTransfer: typeRecords.filter((r) => !r.selfServed).length,
  };
  return acc;
}, {});

const topBacklogItems = Object.entries(
  records
    .filter((r) => r.backlogRecommendation)
    .reduce((acc, r) => {
      acc[r.backlogRecommendation] = (acc[r.backlogRecommendation] || 0) + 1;
      return acc;
    }, {})
)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([recommendation, frequency]) => ({ recommendation, frequency }));

const summary = {
  generatedAt: new Date().toISOString(),
  totalCalls,
  selfServedCount,
  agentTransferCount: totalCalls - selfServedCount,
  deflectionRate: `${deflectionRate}%`,
  sentimentBreakdown,
  callTypeBreakdown,
  topBacklogItems,
};

fs.writeFileSync("callData.json", JSON.stringify(records, null, 2));
fs.writeFileSync("summary.json", JSON.stringify(summary, null, 2));

console.log("✅ Generated callData.json and summary.json");
console.log(`📊 Deflection Rate: ${deflectionRate}%`);
console.log(`📞 Total Calls: ${totalCalls}`);
console.log(`🤖 AI Self-Served: ${selfServedCount}`);
console.log(`👤 Agent Transfers: ${totalCalls - selfServedCount}`);
console.log("\n🏆 Top Backlog Items:");
topBacklogItems.forEach((item, i) =>
  console.log(`  ${i + 1}. (${item.frequency}x) ${item.recommendation}`)
);