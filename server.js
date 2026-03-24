const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("GhostWriter backend is running.");
});

app.post("/generate", (req, res) => {
  const { topic, tone, type } = req.body;

  const safeTopic = (topic || "something").trim();
  const safeTone = (tone || "bold").trim();
  const safeType = (type || "drink").trim();

  let posts = [];

  if (safeType === "drink") {
    posts = [
      `${safeTopic} just dropped. It’s ${safeTone} and not for beginners.`,
      `This ${safeTopic} hits different. Come prove it.`,
      `You think you’ve had a good ${safeTopic}? Think again.`,
      `${safeTopic} + good vibes = your next bad decision.`,
      `Not everyone can handle this ${safeTopic}. You in?`
    ];
  } else if (safeType === "food") {
    posts = [
      `${safeTopic} is calling your name. Answer it.`,
      `Skip cooking tonight. ${safeTopic} is ready.`,
      `If you're hungry, this ${safeTopic} solves that problem fast.`,
      `${safeTopic} done right. No shortcuts.`,
      `Pull up for ${safeTopic} and thank us later.`
    ];
  } else if (safeType === "event") {
    posts = [
      `${safeTopic} is going down. Don’t hear about it later.`,
      `This isn’t just another night. ${safeTopic} changes the game.`,
      `${safeTopic} is where you need to be.`,
      `Miss this and you’ll regret it.`,
      `${safeTopic}. Be there.`
    ];
  } else {
    posts = [
      `${safeTopic} done ${safeTone}.`,
      `${safeTopic} is the move.`,
      `You’re sleeping on ${safeTopic}.`,
      `${safeTopic} but louder.`,
      `${safeTopic} just got interesting.`
    ];
  }

  res.json({ posts });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});