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
const useHttps = process.env.HTTPS !== 'false';

const sessionConfig = JSON.stringify({
  session: {
    type: "realtime",
    model: "gpt-realtime",
    audio: {
      output: {
        voice: "marin",
      },
    },
  },
});

// API route for ephemeral token generation
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: sessionConfig,
      },
    );

    const data = await response.json();
    res.json(data);
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

if (useHttps && fs.existsSync('./certs/key.pem')) {
  const httpsOptions = {
    key: fs.readFileSync('./certs/key.pem'),
    cert: fs.readFileSync('./certs/cert.pem')
  };

  https.createServer(httpsOptions, app).listen(port, () => {
    console.log(`HTTPS server running on https://localhost:${port}`);
  });
} else {
  app.listen(port, () => {
    console.log(`HTTP server running on http://localhost:${port}`);
  });
}
