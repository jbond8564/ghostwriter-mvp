const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/", (req, res) => {
  res.send("GhostWriter backend is running.");
});

app.post("/generate", async (req, res) => {
  try {
    const { topic, tone, type } = req.body;

    const safeTopic = (topic || "something").trim();
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
You are writing social media captions for bars, restaurants, and nightlife venues.

Write exactly 5 short captions for this:
Topic: ${safeTopic}
Tone: ${safeTone}
Content type: ${typeLabel}

Rules:
- Each caption should be 1 to 2 sentences
- Make them sound human, punchy, and usable right away
- Avoid hashtags
- Avoid emojis
- Avoid numbering
- Keep each caption distinct
- Match the requested tone
- Return only the 5 captions, one per line
`;

    const response = await client.responses.create({
      model: "gpt-5.4",
      input: prompt
    });

    const text = (response.output_text || "").trim();

    const posts = text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    res.json({ posts });
  } catch (error) {
    console.error(error);
    const message =
      error?.error?.message ||
      error?.message ||
      "Something went wrong on the server.";
    res.status(500).json({ error: message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});