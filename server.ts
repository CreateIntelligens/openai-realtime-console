import express from "express";
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.text());
const port = process.env.PORT || 8908;
const apiKey = process.env.OPENAI_API_KEY;
const useHttps = process.env.HTTPS !== "false";
const realtimeModel =
  process.env.REALTIME_MODEL || "gpt-4o-realtime-preview-2024-12-17";
const realtimeVoice = process.env.REALTIME_VOICE || "sage";

const sessionConfig = {
  model: realtimeModel,
  voice: realtimeVoice,
  input_audio_transcription: {
    model: "whisper-1",
  },
};

// API route for ephemeral token generation
app.get("/token", async (req, res) => {
  try {
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }

    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "realtime=v1",
        },
        body: JSON.stringify(sessionConfig),
      },
    );

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json({ ...data, model: realtimeModel });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Serve static files from client/dist/client
app.use(express.static(path.join(__dirname, "client/dist/client")));

// SPA fallback - serve index.html for all other routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client/dist/client/index.html"));
});

if (useHttps && fs.existsSync("./certs/key.pem")) {
  const httpsOptions = {
    key: fs.readFileSync("./certs/key.pem"),
    cert: fs.readFileSync("./certs/cert.pem"),
  };

  https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`HTTPS server running on https://localhost:${port}`);
  });
} else {
  app.listen(port, () => {
    console.log(`HTTP server running on http://localhost:${port}`);
  });
}
