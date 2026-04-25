// telegram.js — Telegram bot bridge for Hamster
// Privacy note: messages pass through Telegram's servers to reach your local machine.
// This is unavoidable with any Telegram integration. Your LLM responses stay local;
// only the text of your messages touches Telegram's infrastructure.

import TelegramBot from "node-telegram-bot-api";
import chalk from "chalk";

export class TelegramBridge {
  constructor(hamster, config) {
    this.hamster = hamster;
    this.config = config;
    this.bot = null;
    this.allowedUsers = config.telegram.allowedUserIds || []; // whitelist
    this.perUserHistory = {}; // separate conversation per user
  }

  start() {
    if (!this.config.telegram?.token) {
      throw new Error("Telegram token not set in config.");
    }

    this.bot = new TelegramBot(this.config.telegram.token, { polling: true });

    console.log(chalk.green("  ✓ Telegram bridge online"));

    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text;

      // Enforce whitelist if configured
      if (this.allowedUsers.length > 0 && !this.allowedUsers.includes(userId)) {
        await this.bot.sendMessage(chatId, "🐹 *squeaks suspiciously* I don't know you.");
        return;
      }

      if (!text) return; // skip non-text messages for now

      // Swap to per-user history so conversations don't bleed
      const savedHistory = this.hamster.conversationHistory;
      this.hamster.conversationHistory = this.perUserHistory[userId] || [];

      try {
        // Show typing indicator
        await this.bot.sendChatAction(chatId, "typing");

        const reply = await this.hamster.chat(text);
        this.perUserHistory[userId] = [...this.hamster.conversationHistory];

        await this.bot.sendMessage(chatId, reply, {
          parse_mode: "Markdown",
        });
      } catch (err) {
        console.error(chalk.red(`Telegram error: ${err.message}`));
        await this.bot.sendMessage(chatId, `⚠️ ${err.message}`);
      } finally {
        // Restore CLI history
        this.hamster.conversationHistory = savedHistory;
      }
    });

    this.bot.on("polling_error", (err) => {
      console.error(chalk.red(`Telegram polling error: ${err.message}`));
    });
  }

  stop() {
    if (this.bot) this.bot.stopPolling();
  }
}
