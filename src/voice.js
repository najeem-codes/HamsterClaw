// voice.js — Voice input via OpenAI Whisper (runs locally via whisper.cpp or openai-whisper)
// For mobile: use the companion HTTP endpoint below with a Siri Shortcut or Tasker

import { exec } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import { promisify } from "util";

const execAsync = promisify(exec);

export class VoiceHandler {
  constructor(config) {
    this.config = config;
    this.whisperModel = config.voice?.whisperModel || "base";
    this.whisperBin = config.voice?.whisperBin || "whisper";
    this.httpPort = config.voice?.httpPort || 8765;
  }

  // Transcribe an audio file using whisper CLI
  async transcribe(audioPath) {
    const outPath = audioPath.replace(/\.[^/.]+$/, ".txt");
    try {
      await execAsync(
        `${this.whisperBin} "${audioPath}" --model ${this.whisperModel} --output_format txt --output_dir "${path.dirname(audioPath)}"`
      );
      if (fs.existsSync(outPath)) {
        const text = fs.readFileSync(outPath, "utf-8").trim();
        fs.unlinkSync(outPath); // clean up
        return text;
      }
      throw new Error("Whisper produced no output file.");
    } catch (err) {
      throw new Error(`Whisper transcription failed: ${err.message}`);
    }
  }

  // Start an HTTP server so mobile apps can POST audio for transcription + response
  // Use with Siri Shortcuts (iOS) or Tasker (Android) — see README for setup
  startHttpServer(hamster) {
    const server = http.createServer(async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end("Method not allowed");
        return;
      }

      // Route: POST /voice — receive raw audio bytes, transcribe, respond
      if (req.url === "/voice") {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          const tmpPath = `/tmp/hamster_voice_${Date.now()}.wav`;
          fs.writeFileSync(tmpPath, Buffer.concat(chunks));

          try {
            const transcribed = await this.transcribe(tmpPath);
            fs.unlinkSync(tmpPath);

            const reply = await hamster.chat(transcribed);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ transcribed, reply }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      // Route: POST /text — plain text, no audio (for simple mobile shortcuts)
      if (req.url === "/text") {
        let body = "";
        req.on("data", (d) => (body += d));
        req.on("end", async () => {
          try {
            const { message } = JSON.parse(body);
            const reply = await hamster.chat(message);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ reply }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.listen(this.httpPort, "127.0.0.1", () => {
      console.log(
        `  ✓ Voice HTTP server on http://127.0.0.1:${this.httpPort}`
      );
      console.log(
        `    (expose via Tailscale or ngrok for mobile access — see README)`
      );
    });

    return server;
  }
}
