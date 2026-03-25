const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// MVP only: resets on restart/redeploy
let postsDB = [];
let scheduledDB = [];

app.get("/", (req, res) => {
  res.send("Inkora Social API is live");
});

app.post("/generate", async (req, res) => {
  try {
    const { topic, tone, type } = req.body;

    if (!topic || topic.trim().length < 2) {
      return res.status(400).json({ error: "Topic is required" });
    }

    const safeTopic = topic.trim();
    const safeTone = (tone || "bold").trim();
    const safeType = (type || "drink").trim();

    const typeMap = {
      "drink": "Drink Promo",
      "food": "Food Special",
      "event": "Event Promotion",
      "happy-hour": "Happy Hour",
      "weekend-special": "Weekend Special"
    };

    const typeLabel = typeMap[safeType] || "Promotion";

    const prompt = `
Return a valid JSON object in exactly this format:
{
  "posts": ["...", "...", "...", "...", "..."]
}

Write 5 social media captions for a hospitality business.

Topic: ${safeTopic}
Tone: ${safeTone}
Content type: ${typeLabel}

Rules:
- 1 to 3 sentences each
- No emojis
- No hashtags
- No numbering
- Make them feel real, sharp, and local-business ready
- Each caption should feel distinct
- Return JSON only
`;

    const response = await client.responses.create({
      model: "gpt-5.4",
      input: prompt
    });

    const raw = (response.output_text || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "AI response parsing failed",
        raw
      });
    }

    const posts = Array.isArray(parsed.posts) ? parsed.posts.slice(0, 5) : [];

    if (!posts.length) {
      return res.status(500).json({ error: "No posts returned from AI" });
    }

    const record = {
      id: uuidv4(),
      topic: safeTopic,
      tone: safeTone,
      type: safeType,
      posts,
      createdAt: new Date().toISOString()
    };

    postsDB.unshift(record);

    res.json({
      posts,
      recordId: record.id,
      meta: {
        topic: safeTopic,
        tone: safeTone,
        type: safeType
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Generation failed" });
  }
});

app.get("/posts", (req, res) => {
  res.json(postsDB.slice(0, 20));
});

app.post("/schedule", (req, res) => {
  try {
    const { postText, platform, date, time, repeat } = req.body;

    if (!postText) {
      return res.status(400).json({ error: "Missing post text" });
    }

    const scheduled = {
      id: uuidv4(),
      postText,
      platform: platform || "Instagram",
      date: date || null,
      time: time || null,
      repeat: repeat || "One time",
      status: "scheduled",
      createdAt: new Date().toISOString()
    };

    scheduledDB.unshift(scheduled);

    res.json({
      success: true,
      scheduled
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Scheduling failed" });
  }
});

app.get("/scheduled", (req, res) => {
  res.json(scheduledDB.slice(0, 20));
});

app.listen(PORT, () => {
  console.log(`Inkora Social API running on port ${PORT}`);
});