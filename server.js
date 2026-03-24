const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("GhostWriter backend LIVE AI VERSION");
});

app.post("/generate", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing on the server."
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    console.log("USING LIVE AI BACKEND");

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
You are a strong social media copywriter for bars, restaurants, nightlife venues, and local food spots.

Write exactly 5 social media captions for this business promotion.

Topic: ${safeTopic}
Tone: ${safeTone}
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
- Do not put quotation marks around the captions
- Do not include labels like "Caption 1"
- Return only the 5 captions, one caption per line

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

    const text = (response.output_text || "").trim();

    const posts = text
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .slice(0, 5);

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