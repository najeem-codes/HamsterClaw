#!/usr/bin/env node
// setup.js — Hamster guided setup wizard
// Run with: node setup.js

import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import fetch from "node-fetch";
import { saveConfig, loadConfig } from "./src/config.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));
const yn = async (q) => {
  const a = await ask(q + chalk.dim(" [y/N] ") );
  return a.trim().toLowerCase() === "y";
};

async function checkOllama(baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return null;
    const data = await r.json();
    return data.models || [];
  } catch {
    return null;
  }
}

async function main() {
  console.clear();
  console.log(chalk.yellow(`
  ██╗  ██╗ █████╗ ███╗   ███╗███████╗████████╗███████╗██████╗ 
  ██║  ██║██╔══██╗████╗ ████║██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ███████║███████║██╔████╔██║███████╗   ██║   █████╗  ██████╔╝
  ██╔══██║██╔══██║██║╚██╔╝██║╚════██║   ██║   ██╔══╝  ██╔══██╗
  ██║  ██║██║  ██║██║ ╚═╝ ██║███████║   ██║   ███████╗██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
  `));
  console.log(chalk.dim("  Your local AI assistant. Private. Fast. On your wheel.\n"));
  console.log(chalk.dim("  This wizard will configure Hamster. Takes ~2 minutes.\n"));

  const existing = await loadConfig();
  const config = { ...existing };

  // ── Step 1: User name ───────────────────────────────────────────
  console.log(chalk.cyan("── Step 1: Who are you? ──\n"));
  const name = await ask(chalk.white("  Your name (or leave blank): "));
  if (name.trim()) config.user = { name: name.trim() };

  // ── Step 2: Ollama ──────────────────────────────────────────────
  console.log(chalk.cyan("\n── Step 2: Ollama (your local LLM) ──\n"));
  console.log(chalk.dim("  Hamster uses Ollama to run LLMs locally. Install from https://ollama.com\n"));

  const ollamaUrl = await ask(
    chalk.white(`  Ollama URL [${config.ollama.baseUrl}]: `)
  );
  if (ollamaUrl.trim()) config.ollama.baseUrl = ollamaUrl.trim();

  const spinner = ora("  Checking Ollama...").start();
  const models = await checkOllama(config.ollama.baseUrl);
  
  if (!models) {
    spinner.fail(chalk.red("  Ollama not reachable. Is it running? (ollama serve)"));
    console.log(chalk.dim("  You can still finish setup and run Ollama later.\n"));
  } else if (models.length === 0) {
    spinner.warn(chalk.yellow("  Ollama running but no models installed."));
    console.log(chalk.dim(`  Run: ollama pull llama3.2\n`));
  } else {
    spinner.succeed(chalk.green(`  Ollama running — ${models.length} model(s) found`));
    console.log(chalk.dim("  Available models:"));
    models.slice(0, 6).forEach((m) => console.log(chalk.dim(`    • ${m.name}`)));
    if (models.length > 6) console.log(chalk.dim(`    ...and ${models.length - 6} more`));
    console.log();
  }

  const modelInput = await ask(
    chalk.white(`  Which model to use? [${config.ollama.model}]: `)
  );
  if (modelInput.trim()) config.ollama.model = modelInput.trim();

  // ── Step 3: Telegram ────────────────────────────────────────────
  console.log(chalk.cyan("\n── Step 3: Telegram (optional) ──\n"));
  console.log(
    chalk.dim(
      "  Create a bot via @BotFather on Telegram, then paste the token here.\n" +
      "  Privacy note: messages transit Telegram's servers. Responses stay local.\n"
    )
  );

  const wantTelegram = await yn("  Enable Telegram integration?");
  if (wantTelegram) {
    const token = await ask(chalk.white("  Telegram bot token: "));
    if (token.trim()) {
      config.telegram = { enabled: true, token: token.trim(), allowedUserIds: [] };
      console.log(
        chalk.dim(
          "\n  Tip: Add your Telegram user ID to allowedUserIds in hamster.config.json\n" +
          "  to prevent strangers from using your bot.\n"
        )
      );
    }
  } else {
    config.telegram = { enabled: false, token: null };
  }

  // ── Step 4: Discord ─────────────────────────────────────────────
  console.log(chalk.cyan("\n── Step 4: Discord (optional) ──\n"));
  console.log(
    chalk.dim(
      "  Create a bot at https://discord.com/developers/applications\n" +
      "  Enable 'Message Content Intent' under Bot > Privileged Gateway Intents.\n"
    )
  );

  const wantDiscord = await yn("  Enable Discord integration?");
  if (wantDiscord) {
    const token = await ask(chalk.white("  Discord bot token: "));
    const prefix = await ask(chalk.white("  Command prefix in servers [!]: "));
    if (token.trim()) {
      config.discord = {
        enabled: true,
        token: token.trim(),
        prefix: prefix.trim() || "!",
        dmOnly: true,
        allowedChannelIds: [],
      };
      console.log(chalk.dim("\n  By default Hamster only responds to DMs.\n  Add channel IDs to allowedChannelIds in config to enable server channels.\n"));
    }
  } else {
    config.discord = { enabled: false, token: null };
  }

  // ── Step 5: Voice ───────────────────────────────────────────────
  console.log(chalk.cyan("\n── Step 5: Voice (optional) ──\n"));
  console.log(
    chalk.dim(
      "  Voice input uses Whisper (runs locally). Install it first:\n" +
      "    pip install openai-whisper  OR  brew install whisper-cpp\n" +
      "  For mobile access, expose the local port via Tailscale (recommended, private)\n" +
      "  or ngrok (easier, but routes through their servers).\n"
    )
  );

  const wantVoice = await yn("  Enable voice input?");
  if (wantVoice) {
    const model = await ask(chalk.white("  Whisper model (tiny/base/small/medium) [base]: "));
    const port = await ask(chalk.white("  HTTP port for voice server [8765]: "));
    config.voice = {
      enabled: true,
      whisperModel: model.trim() || "base",
      whisperBin: "whisper",
      httpPort: parseInt(port.trim()) || 8765,
    };
  } else {
    config.voice = { enabled: false };
  }

  // ── Save ────────────────────────────────────────────────────────
  console.log(chalk.cyan("\n── Saving config... ──\n"));
  saveConfig(config);

  console.log(chalk.green("  ✓ Config saved to config/hamster.config.json\n"));
  console.log(chalk.yellow("  To start Hamster:\n"));
  console.log(chalk.white("    node start.js\n"));

  if (config.telegram?.enabled)
    console.log(chalk.dim("  Telegram bot will start automatically."));
  if (config.discord?.enabled)
    console.log(chalk.dim("  Discord bot will start automatically."));
  if (config.voice?.enabled)
    console.log(chalk.dim(`  Voice server on port ${config.voice.httpPort}.`));

  console.log(chalk.dim("\n  See README.md for mobile voice setup instructions.\n"));

  rl.close();
}

main().catch((err) => {
  console.error(chalk.red(`\nSetup error: ${err.message}\n`));
  process.exit(1);
});
