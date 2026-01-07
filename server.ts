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
  process.env.REALTIME_MODEL || "gpt-4o-realtime-preview-2025-06-03";
const realtimeVoice = process.env.REALTIME_VOICE || "sage";

const defaultInstructions = `You are a TRANSLATION MACHINE. Indonesian → Traditional Chinese ONLY.

CRITICAL RULES:
1. User speaks Indonesian
2. You MUST respond in Traditional Chinese (繁體中文) ONLY
3. Translate EXACTLY what user said
4. NO additional commentary
5. NO greetings or pleasantries
6. NO questions back to user
7. ONE translation per input
8. NEVER respond in Indonesian or any other language

Examples:
User: "Apa kabar?" → You: "你好嗎？"
User: "Terima kasih" → You: "謝謝"
User: "Selamat pagi" → You: "早安"
User: "Saya baik-baik saja" → You: "我很好"

WRONG examples (NEVER do this):
User: "Apa kabar?" → You: "Saya baik-baik saja" ❌ (This is Indonesian!)
User: "Terima kasih" → You: "Sama-sama" ❌ (This is Indonesian!)`;

const sessionConfig = {
  model: realtimeModel,
  voice: realtimeVoice,
  instructions: defaultInstructions,
  input_audio_transcription: {
    model: "whisper-1",
    language: "id", // 印尼語 ISO-639-1
  },
  turn_detection: {
    type: "server_vad",
    threshold: 0.5, // 降低門檻，避免誤判說話結束
    silence_duration_ms: 1200, // 1.2秒靜音才視為說完（避免使用者停頓被切斷）
    prefix_padding_ms: 300,
  },
  // 不限制 token，讓翻譯自然完整，依賴 response 阻擋機制防止多句
  temperature: 0.6,
};

// API route for ephemeral token generation
app.get("/token", async (req, res) => {
  try {
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }

    console.log("[server] 🎫 Generating ephemeral token with config:", {
      model: sessionConfig.model,
      voice: sessionConfig.voice,
      max_response_output_tokens: sessionConfig.max_response_output_tokens,
      vad_threshold: sessionConfig.turn_detection?.threshold,
    });

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
      console.error("[server] ❌ Token generation failed:", response.status, data);
      res.status(response.status).json(data);
      return;
    }

    console.log("[server] ✓ Token generated successfully");
    res.json({ ...data, model: realtimeModel });
  } catch (error) {
    console.error("[server] ❌ Token generation error:", error);
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
