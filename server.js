const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN
  })
);
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// In-memory MVP storage
let postsDB = [];
let scheduledDB = [];

const ALLOWED_TONES = new Set(["funny", "edgy", "professional"]);
const ALLOWED_TYPES = new Set([
  "drink",
  "food",
  "event",
  "happy-hour",
  "weekend-special"
]);
const ALLOWED_PLATFORMS = new Set(["Instagram", "Facebook", "TikTok", "X"]);
const ALLOWED_REPEATS = new Set(["One time", "Daily", "Weekly"]);

function safeTrim(value, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function parsePostsFromOutput(outputText) {
  const text = safeTrim(outputText);

  if (!text) {
    return [];
  }

  // First try JSON
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed.posts)) {
      return parsed.posts
        .map((post) => safeTrim(post))
        .filter(Boolean)
        .slice(0, 5);
    }
  } catch (err) {
    // Fall through to line parsing
  }

  // Fallback: split by blank lines, then by lines if needed
  const byParagraph = text
    .split(/\n\s*\n/)
    .map((chunk) => safeTrim(chunk))
    .filter(Boolean);

  if (byParagraph.length >= 5) {
    return byParagraph.slice(0, 5);
  }

  return text
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

app.get("/", (req, res) => {
  res.send("Inkora Social API is live");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Inkora Social API",
    time: new Date().toISOString()
  });
});

app.post("/generate", async (req, res) => {
  try {
    const topic = safeTrim(req.body?.topic);
    const tone = safeTrim(req.body?.tone, "professional").toLowerCase();
    const type = safeTrim(req.body?.type, "drink").toLowerCase();

    if (!topic || topic.length < 2) {
      return res.status(400).json({
        error: "Topic is required."
      });
    }

    if (topic.length > 160) {
      return res.status(400).json({
        error: "Topic is too long."
      });
    }

    if (!ALLOWED_TONES.has(tone)) {
      return res.status(400).json({
        error: "Invalid tone selected."
      });
    }

    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({
        error: "Invalid content type selected."
      });
    }

    const typeMap = {
      drink: "Drink Promo",
      food: "Food Special",
      event: "Event Promotion",
      "happy-hour": "Happy Hour",
      "weekend-special": "Weekend Special"
    };

    const typeLabel = typeMap[type] || "Promotion";

    const prompt = `
You are a strong social media copywriter for bars, restaurants, nightlife venues, and local food spots.

Return a JSON object in this exact format:
{
  "posts": ["caption 1", "caption 2", "caption 3", "caption 4", "caption 5"]
}

Write exactly 5 social media captions.

Topic: ${topic}
Tone: ${tone}
Content type: ${typeLabel}

Requirements:
- Each caption must feel natural, human, and ready to post
- Each caption should be different in structure and phrasing
- Keep each caption between 1 and 3 short sentences
- Make them sound confident, specific, and local-business friendly
- Avoid sounding robotic, cheesy, or corporate
- Avoid repeating the same opening pattern
- Do not number the captions
- Do not use hashtags
- Do not use emojis
- Do not put quotation marks around the captions themselves
- Return only valid JSON

Style guidance by content type:
- Drink Promo: make it tempting, fun, craveable, and a little bold
- Food Special: make it sound satisfying, craveable, and worth showing up for
- Event Promotion: create urgency and make people feel they should be there
- Happy Hour: make it sound like the best excuse to stop in after work
- Weekend Special: make it sound limited, timely, and worth making plans for

Style guidance by tone:
- Funny: clever, playful, lightly witty, but still usable for a real business
- Edgy: bold, punchy, a little provocative, but not offensive
- Professional: polished, confident, and clean without sounding boring

Important:
- Make the captions sound like they were written by someone who understands hospitality marketing
- Vary the energy and rhythm across the 5 captions
- Make at least 2 captions feel especially strong and post-ready with almost no editing
`;

    const response = await client.responses.create({
      model: "gpt-5.4",
      input: prompt
    });

    const posts = parsePostsFromOutput(response.output_text);

    if (!posts.length) {
      return res.status(500).json({
        error: "No posts were generated."
      });
    }

    const record = {
      id: crypto.randomUUID(),
      topic,
      tone,
      type,
      posts,
      createdAt: new Date().toISOString()
    };

    postsDB.unshift(record);

    res.json({
      posts,
      recordId: record.id,
      meta: {
        topic,
        tone,
        type,
        generatedAt: record.createdAt
      }
    });
  } catch (error) {
    console.error("Generate error:", error);

    const message =
      error?.error?.message ||
      error?.message ||
      "Something went wrong on the server.";

    res.status(500).json({
      error: message
    });
  }
});

app.get("/posts", (req, res) => {
  res.json({
    posts: postsDB.slice(0, 20)
  });
});

app.post("/schedule", (req, res) => {
  try {
    const postText = safeTrim(req.body?.postText);
    const platform = safeTrim(req.body?.platform);
    const date = safeTrim(req.body?.date);
    const time = safeTrim(req.body?.time);
    const repeat = safeTrim(req.body?.repeat, "One time");

    if (!postText) {
      return res.status(400).json({
        error: "Post text is required."
      });
    }

    if (!ALLOWED_PLATFORMS.has(platform)) {
      return res.status(400).json({
        error: "Invalid platform selected."
      });
    }

    if (!ALLOWED_REPEATS.has(repeat)) {
      return res.status(400).json({
        error: "Invalid repeat option selected."
      });
    }

    const scheduled = {
      id: crypto.randomUUID(),
      postText,
      platform,
      date: date || null,
      time: time || null,
      repeat,
      status: "saved",
      createdAt: new Date().toISOString()
    };

    scheduledDB.unshift(scheduled);

    res.json({
      success: true,
      scheduled
    });
  } catch (error) {
    console.error("Schedule error:", error);

    res.status(500).json({
      error: "Scheduling failed."
    });
  }
});

app.get("/scheduled", (req, res) => {
  res.json({
    scheduled: scheduledDB.slice(0, 20)
  });
});

app.listen(PORT, () => {
  console.log(`Inkora Social API running on port ${PORT}`);
});