// voice.js — Voice input via OpenAI Whisper (runs locally via whisper.cpp or openai-whisper)
// For mobile: use the companion HTTP endpoint below with a Siri Shortcut or Tasker

import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import crypto from "crypto";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_TEXT_BYTES = 64 * 1024;          // 64 KB

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
      await execFileAsync(this.whisperBin, [
        audioPath,
        "--model", this.whisperModel,
        "--output_format", "txt",
        "--output_dir", path.dirname(audioPath),
      ]);
      if (fs.existsSync(outPath)) {
        const text = fs.readFileSync(outPath, "utf-8").trim();
        fs.unlinkSync(outPath);
        return text;
      }
      throw new Error("Whisper produced no output file.");
    } catch (err) {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
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
        let totalSize = 0;
        req.on("data", (chunk) => {
          totalSize += chunk.length;
          if (totalSize > MAX_AUDIO_BYTES) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Audio file too large" }));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", async () => {
          if (res.writableEnded) return;
          const tmpPath = path.join(os.tmpdir(), `hamster_voice_${crypto.randomUUID()}.wav`);
          try {
            fs.writeFileSync(tmpPath, Buffer.concat(chunks));
            const transcribed = await this.transcribe(tmpPath);
            const reply = await hamster.chat(transcribed);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ transcribed, reply }));
          } catch (err) {
            if (!res.writableEnded) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          } finally {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
          }
        });
        return;
      }

      // Route: POST /text — plain text, no audio (for simple mobile shortcuts)
      if (req.url === "/text") {
        let body = "";
        let bodySize = 0;
        req.on("data", (d) => {
          bodySize += d.length;
          if (bodySize > MAX_TEXT_BYTES) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Request too large" }));
            req.destroy();
            return;
          }
          body += d;
        });
        req.on("end", async () => {
          if (res.writableEnded) return;
          try {
            const parsed = JSON.parse(body);
            const message = parsed?.message;
            if (!message || typeof message !== "string") {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Missing or invalid 'message' field" }));
              return;
            }
            const reply = await hamster.chat(message);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ reply }));
          } catch (err) {
            if (!res.writableEnded) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
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
