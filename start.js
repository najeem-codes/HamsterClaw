#!/usr/bin/env node
// start.js — Hamster entry point
// Starts the CLI, Telegram bot, Discord bot, and voice server based on your config

import chalk from "chalk";
import { HamsterAssistant } from "./src/hamster.js";
import { loadConfig } from "./src/config.js";
import fs from "fs";

async function main() {
  // Check config exists
  if (!fs.existsSync("./config/hamster.config.json")) {
    console.log(chalk.yellow("\n  No config found. Running setup wizard...\n"));
    const { execSync } = await import("child_process");
    execSync("node setup.js", { stdio: "inherit" });
    return;
  }

  const config = await loadConfig();
  const hamster = new HamsterAssistant();
  await hamster.init();

  console.log(chalk.yellow("\n🐹 Hamster — Local AI Assistant"));
  console.log(chalk.dim(`  Model: ${config.ollama.model} via ${config.ollama.baseUrl}`));

  if (config.telegram?.enabled && config.telegram?.token) {
    const { TelegramBridge } = await import("./src/telegram.js");
    const tg = new TelegramBridge(hamster, config);
    try {
      await tg.start();
    } catch (err) {
      console.log(chalk.red(`  Telegram failed: ${err.message}`));
    }
  }

  if (config.discord?.enabled && config.discord?.token) {
    const { DiscordBridge } = await import("./src/discord.js");
    const dc = new DiscordBridge(hamster, config);
    try {
      await dc.start();
    } catch (err) {
      console.log(chalk.red(`  Discord failed: ${err.message}`));
    }
  }

  if (config.voice?.enabled) {
    const { VoiceHandler } = await import("./src/voice.js");
    const voice = new VoiceHandler(config);
    voice.startHttpServer(hamster);
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\n🐹 *emergency cheek-stuffing* Shutting down..."));
    process.exit(0);
  });

  // Start CLI last (it blocks)
  await hamster.startCLI();
}

main().catch((err) => {
  console.error(chalk.red(`\nFatal: ${err.message}\n`));
  process.exit(1);
});
