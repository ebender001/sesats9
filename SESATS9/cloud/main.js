const { buildSesatsAIPrompt } = require("./prompts/sesatsAIPrompt");
const { callOpenAIResponse } = require("./services/openai");

function requireString(params, key) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Missing or invalid parameter: ${key}`
    );
  }
  return value.trim();
}

function optionalString(params, key) {
  const value = params[key];
  if (value == null) return "";
  return String(value);
}

const PROMPT_VERSION = 1;

Parse.Cloud.define("generateSesatsAIUpdate", async (request) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      "Server configuration error: missing OPENAI_API_KEY"
    );
  }

  const model = process.env.OPENAI_MODEL || "gpt-6-luna";

  // 🔥 FORCE NUMBER TYPE EARLY
  const questionIDRaw = request.params.questionID;
  const questionID =
    questionIDRaw === undefined || questionIDRaw === null
      ? null
      : Number(questionIDRaw);

  const questionStem = requireString(request.params, "questionStem");
  const aChoice = optionalString(request.params, "aChoice");
  const bChoice = optionalString(request.params, "bChoice");
  const cChoice = optionalString(request.params, "cChoice");
  const dChoice = optionalString(request.params, "dChoice");
  const eChoice = optionalString(request.params, "eChoice");
  const correctChoice = requireString(request.params, "correctChoice");
  const critique = optionalString(request.params, "critique");

  // 🔍 1. CHECK CACHE FIRST
  let cachedText = null;
  try {
    cachedText = await getCachedInsight(
      questionID,
      PROMPT_VERSION,
      model
    );
  } catch (err) {
    console.error("Cache lookup failed:", err);
  }

  if (cachedText) {
    return {
      questionID,
      model,
      promptVersion: PROMPT_VERSION,
      text: String(cachedText),
      cached: true
    };
  }

  // 🧠 2. BUILD PROMPT
  const prompt = buildSesatsAIPrompt({
    questionStem,
    aChoice,
    bChoice,
    cChoice,
    dChoice,
    eChoice,
    correctChoice,
    critique,
  });

  // 🤖 3. CALL OPENAI
    const { text, usage } = await callOpenAIResponse({
    apiKey,
    prompt,
    model,
    maxOutputTokens: 1200,
  });
  
  if (!text || !text.trim()) {
    throw new Parse.Error(
      Parse.Error.SCRIPT_FAILED,
      "AI returned empty response"
    );
  }
  
  const cleanText = text.trim();
  
  try {
    await logAIUsage({
      questionID,
      model,
      promptVersion: PROMPT_VERSION,
      usage,
    });
  } catch (err) {
    console.error("AI usage logging failed:", err);
  }

  // 💾 4. SAVE CACHE
  try {
    await saveInsightCache({
      questionID,
      promptVersion: PROMPT_VERSION,
      model,
      text: cleanText
    });
  } catch (err) {
    console.error("Cache save failed:", err);
    // never fail user request because of cache
  }

  // 🚀 5. RETURN RESULT
  return {
    questionID,
    model,
    promptVersion: PROMPT_VERSION,
    text: cleanText,
    cached: false
  };
});

async function getCachedInsight(questionID, promptVersion, model) {
  const qID = Number(questionID);

  if (!Number.isFinite(qID)) {
    console.error("Invalid questionID:", questionID);
    return null;
  }

  const Cache = Parse.Object.extend("AIInsightCache");
  const query = new Parse.Query(Cache);

  query.equalTo("questionID", qID);
  query.equalTo("promptVersion", Number(promptVersion));
  query.equalTo("model", model);

  try {
    const result = await query.first({ useMasterKey: true });

    if (!result) return null;

    const text = result.get("text");
    if (!text || typeof text !== "string") return null;

    return text;
  } catch (err) {
    console.error("Cache lookup failed:", err);
    return null;
  }
}

async function saveInsightCache({ questionID, promptVersion, model, text }) {
  const qID = Number(questionID);
  const pVersion = Number(promptVersion);

  if (!Number.isFinite(qID)) {
    console.error("Invalid questionID:", questionID);
    return;
  }

  const Cache = Parse.Object.extend("AIInsightCache");

  const payload = {
    questionID: qID,
    promptVersion: pVersion,
    model: model,
    text: String(text)
  };

  try {
    // 🔥 First attempt: direct insert (fast path)
    const cache = new Cache();
    Object.entries(payload).forEach(([k, v]) => cache.set(k, v));

    await cache.save(null, { useMasterKey: true });

  } catch (err) {
    // 🔥 If duplicate (unique index hit), update instead
    if (err.code === 137) { // duplicate value for unique index
      try {
        const query = new Parse.Query(Cache);
        query.equalTo("questionID", qID);
        query.equalTo("promptVersion", pVersion);
        query.equalTo("model", model);

        const existing = await query.first({ useMasterKey: true });

        if (existing) {
          existing.set("text", String(text));
          await existing.save(null, { useMasterKey: true });
        }

      } catch (updateErr) {
        console.error("Cache update after duplicate failed:", updateErr);
      }

    } else {
      console.error("Cache save failed:", err);
    }
  }
}

function getDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function logAIUsage({
  questionID,
  model,
  promptVersion,
  usage,
}) {
  const inputTokens = Number(usage?.input_tokens ?? 0);
  const outputTokens = Number(usage?.output_tokens ?? 0);
  const totalTokens = Number(usage?.total_tokens ?? (inputTokens + outputTokens));

  const inputRatePerMillion = 2.5;
  const outputRatePerMillion = 15.0;

  const estimatedInputCost = (inputTokens / 1_000_000) * inputRatePerMillion;
  const estimatedOutputCost = (outputTokens / 1_000_000) * outputRatePerMillion;
  const estimatedTotalCost = estimatedInputCost + estimatedOutputCost;

  const dateKey = getDateKey();

  const UsageLog = Parse.Object.extend("AIUsageLog");
  const log = new UsageLog();

  log.set("dateKey", dateKey);
  log.set("questionID", Number(questionID));
  log.set("model", model);
  log.set("promptVersion", Number(promptVersion));
  log.set("inputTokens", inputTokens);
  log.set("outputTokens", outputTokens);
  log.set("totalTokens", totalTokens);
  log.set("estimatedInputCost", estimatedInputCost);
  log.set("estimatedOutputCost", estimatedOutputCost);
  log.set("estimatedTotalCost", estimatedTotalCost);

  await log.save(null, { useMasterKey: true });

  const Daily = Parse.Object.extend("AIUsageDaily");
  const query = new Parse.Query(Daily);
  query.equalTo("dateKey", dateKey);

  let daily = await query.first({ useMasterKey: true });

  if (!daily) {
    daily = new Daily();
    daily.set("dateKey", dateKey);
    daily.set("inputTokens", 0);
    daily.set("outputTokens", 0);
    daily.set("totalTokens", 0);
    daily.set("estimatedInputCost", 0);
    daily.set("estimatedOutputCost", 0);
    daily.set("estimatedTotalCost", 0);
    daily.set("callCount", 0);
  }

  daily.set("inputTokens", Number(daily.get("inputTokens") || 0) + inputTokens);
  daily.set("outputTokens", Number(daily.get("outputTokens") || 0) + outputTokens);
  daily.set("totalTokens", Number(daily.get("totalTokens") || 0) + totalTokens);
  daily.set("estimatedInputCost", Number(daily.get("estimatedInputCost") || 0) + estimatedInputCost);
  daily.set("estimatedOutputCost", Number(daily.get("estimatedOutputCost") || 0) + estimatedOutputCost);
  daily.set("estimatedTotalCost", Number(daily.get("estimatedTotalCost") || 0) + estimatedTotalCost);
  daily.set("callCount", Number(daily.get("callCount") || 0) + 1);

  await daily.save(null, { useMasterKey: true });
}