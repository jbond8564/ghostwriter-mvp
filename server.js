const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGINS = [
  "https://inkovatech.com",
  "https://www.inkovatech.com",
  "https://ghostwriter-mvp.netlify.app",
  "https://dev--ghostwriter-mvp.netlify.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow server-to-server or curl requests (no origin)
      if (!origin) return callback(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    }
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
let scheduledDB = [];

const DAILY_FREE_LIMIT = 3;

function getTodayKey() {
  const today = new Date();
  return today.toISOString().split("T")[0]; // YYYY-MM-DD
}

async function getUsage(clientId) {
  const today = getTodayKey();
  const environment = process.env.APP_ENV || "prod";

  const { data, error } = await supabase
    .from("usage")
    .select("*")
    .eq("client_id", clientId)
    .eq("date", today)
    .eq("environment", environment)
    .maybeSingle();

  if (error) throw error;

  return data?.count || 0;
}

async function savePostRecord(record) {
  const { data, error } = await supabase
    .from("posts")
    .insert([
      {
        id: record.id,
        client_id: record.clientId,
        promotions_calendar: record.promotionsCalendar,
        tone: record.tone,
        type: record.type,
        platform: record.platform,
        status: record.status,
        scheduled_for: record.scheduledFor,
        posts: record.posts,
        created_at: record.createdAt,
        environment: record.environment
      }
    ])
    .select()
    .single();

  if (error) {
    console.error("Save post error:", error);
    throw error;
  }

  return data;
}

async function incrementUsage(clientId) {
  const today = getTodayKey();
  const environment = process.env.APP_ENV || "prod";

  const { data, error } = await supabase
    .from("usage")
    .select("*")
    .eq("client_id", clientId)
    .eq("date", today)
    .eq("environment", environment)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabase
      .from("usage")
      .insert([
        {
          client_id: clientId,
          date: today,
          count: 1,
          environment
        }
      ]);

    if (insertError) throw insertError;
    return;
  }

  const { error: updateError } = await supabase
    .from("usage")
    .update({ count: data.count + 1 })
    .eq("id", data.id);

  if (updateError) throw updateError;
    }

const ALLOWED_TONES = new Set(["funny", "edgy", "professional"]);
const ALLOWED_TYPES = new Set([
  "drink",
  "food",
  "event",
  "happy-hour",
  "weekend-special"
]);

const ALLOWED_REPEATS = new Set(["One time", "Daily", "Weekly"]);

const ALLOWED_PLATFORMS = new Set(["instagram", "facebook", "tiktok", "x"]);

function safeTrim(value, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function parsePostsFromOutput(outputText) {
  const text = safeTrim(outputText);

  if (!text) {
    return null;
  }

  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ];

  const emptyCalendar = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: []
  };

  // First try JSON
  try {
    const parsed = JSON.parse(text);

    if (!parsed || typeof parsed !== "object" || !parsed.posts || typeof parsed.posts !== "object") {
      return emptyCalendar;
    }

    const cleanedPosts = {};

    for (const day of days) {
      const dayPosts = parsed.posts[day];

      if (Array.isArray(dayPosts)) {
        cleanedPosts[day] = dayPosts
          .map((post) => safeTrim(post))
          .filter(Boolean)
          .slice(0, 3);
      } else {
        cleanedPosts[day] = [];
      }
    }

    return cleanedPosts;
  } catch (err) {
    // Fall through
  }

  // If JSON parsing fails, return empty calendar
  return emptyCalendar;
}

app.get("/", (req, res) => {
  res.send("Inkova Social API is live");
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "Inkova Social API",
    time: new Date().toISOString()
  });
});

app.post("/feedback", async (req, res) => {
  try {
    const { clientId, message, type } = req.body;

    if (!message || message.trim().length < 3) {
      return res.status(400).json({ error: "Message is too short" });
    }

    const safeType = type === "bug" ? "bug" : "feature";

    const { error } = await supabase
      .from("feedback")
      .insert([
        {
          client_id: clientId || "anonymous",
          message: message.trim(),
          type: safeType
        }
      ]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ error: "Failed to save feedback" });
  }
});

app.post("/generate", async (req, res) => {
  try {
    const clientId = safeTrim(req.body?.clientId);
    const environment = process.env.APP_ENV || "prod";


if (!clientId) {
  return res.status(400).json({ error: "Missing clientId" });
}

const currentUsage = await getUsage(clientId);

const isDev = process.env.APP_ENV === "dev";

if (!isDev && currentUsage >= DAILY_FREE_LIMIT) {
  return res.status(429).json({
    error: "Daily limit reached",
    limit: DAILY_FREE_LIMIT
  });
}

const tone = safeTrim(req.body?.tone, "professional").toLowerCase();
const type = safeTrim(req.body?.type, "drink").toLowerCase();
const platform = safeTrim(req.body?.platform).toLowerCase();

const promotionsCalendar = {
  monday: safeTrim(req.body?.monday),
  tuesday: safeTrim(req.body?.tuesday),
  wednesday: safeTrim(req.body?.wednesday),
  thursday: safeTrim(req.body?.thursday),
  friday: safeTrim(req.body?.friday),
  saturday: safeTrim(req.body?.saturday),
  sunday: safeTrim(req.body?.sunday)
};

const hasAtLeastOneDay = Object.values(promotionsCalendar).some(
  (value) => value && value.length >= 2
);

if (!hasAtLeastOneDay) {
  return res.status(400).json({
    error: "At least one day in the promotions calendar is required."
  });
}

for (const [day, value] of Object.entries(promotionsCalendar)) {
  if (value && value.length > 160) {
    return res.status(400).json({
      error: `${day} is too long. Keep each calendar entry under 160 characters.`
    });
  }
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

if (!ALLOWED_PLATFORMS.has(platform)) {
  return res.status(400).json({
    error: "Invalid platform selected."
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
  "posts": {
    "monday": ["caption 1", "caption 2", "caption 3"],
    "tuesday": ["caption 1", "caption 2", "caption 3"],
    "wednesday": ["caption 1", "caption 2", "caption 3"],
    "thursday": ["caption 1", "caption 2", "caption 3"],
    "friday": ["caption 1", "caption 2", "caption 3"],
    "saturday": ["caption 1", "caption 2", "caption 3"],
    "sunday": ["caption 1", "caption 2", "caption 3"]
  }
}

Write exactly 3 social media captions for each day of the week.

Promotions Calendar:
Monday: ${promotionsCalendar.monday || "None"}
Tuesday: ${promotionsCalendar.tuesday || "None"}
Wednesday: ${promotionsCalendar.wednesday || "None"}
Thursday: ${promotionsCalendar.thursday || "None"}
Friday: ${promotionsCalendar.friday || "None"}
Saturday: ${promotionsCalendar.saturday || "None"}
Sunday: ${promotionsCalendar.sunday || "None"}

Tone: ${tone}
Content type: ${typeLabel}
Platform: ${platform}

Use the selected content type as the main writing angle for every day, while still tailoring each caption to that day's specific promotion, event, or special.

Requirements:
- Each caption must feel natural, human, and ready to post
- Each caption should be different in structure and phrasing
- Keep each caption between 2 and 5 short sentences
- Make them sound confident, specific, and local-business friendly
- Avoid sounding robotic, cheesy, or corporate
- Avoid repeating the same opening pattern
- Do not number the captions
- Do not use hashtags
- Do not use emojis
- Do not put quotation marks around the captions themselves
- Return only valid JSON
- If a day says "None", return an empty array for that day

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
- Vary the energy and rhythm across the captions
- Make at least 1 caption per day feel especially strong and post-ready with almost no editing
`;

const response = await client.responses.create({
  model: "gpt-5.4",
  input: prompt
});

const posts = parsePostsFromOutput(response.output_text);

if (!posts || typeof posts !== "object") {
  return res.status(500).json({
    error: "No promotions calendar posts were generated."
  });
}

const hasAnyPosts = Object.values(posts).some(
  (dayPosts) => Array.isArray(dayPosts) && dayPosts.length > 0
);

if (!hasAnyPosts) {
  return res.status(500).json({
    error: "No promotions calendar posts were generated."
  });
}

const record = {
  id: crypto.randomUUID(),
  clientId,
  promotionsCalendar,
  tone,
  type,
  platform,
  status: "generated",
  scheduledFor: null,
  posts,
  createdAt: new Date().toISOString(),
  environment
};

await savePostRecord(record);
await incrementUsage(clientId);

res.json({
  posts,
  recordId: record.id,
  meta: {
    promotionsCalendar,
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

app.get("/posts", async (req, res) => {
  try {
    const clientId = safeTrim(req.query.clientId);

    let query = supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      posts: data || []
    });
  } catch (err) {
    console.error("Fetch posts error:", err);
    res.status(500).json({ error: "Failed to fetch posts." });
  }
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
      status: "draft",
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

app.post("/waitlist", async (req, res) => {
  const email = safeTrim(req.body?.email).toLowerCase();

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required." });
  }

  try {
    const { error } = await supabase
      .from("waitlist")
      .insert([{ email }]);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("Waitlist error:", err);
    res.status(500).json({ error: "Failed to save email." });
  }
});

app.get("/waitlist", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("waitlist")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({ emails: data });
  } catch (err) {
    console.error("Fetch waitlist error:", err);
    res.status(500).json({ error: "Failed to fetch waitlist." });
  }
});

app.listen(PORT, () => {
  console.log(`Inkova Social API running on port ${PORT}`);
});