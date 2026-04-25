// discord.js — Discord bot bridge for Hamster
// Privacy note: messages pass through Discord's servers to reach your local machine.
// Hamster only responds in DMs or channels you explicitly configure.

import { Client, GatewayIntentBits, Partials } from "discord.js";
import chalk from "chalk";

export class DiscordBridge {
  constructor(hamster, config) {
    this.hamster = hamster;
    this.config = config;
    this.client = null;
    this.perChannelHistory = {};
    this.allowedChannels = config.discord.allowedChannelIds || [];
    this.dmOnly = config.discord.dmOnly ?? true; // default: DMs only (safer)
  }

  start() {
    if (!this.config.discord?.token) {
      throw new Error("Discord token not set in config.");
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.client.once("ready", () => {
      console.log(chalk.green(`  ✓ Discord bridge online (${this.client.user.tag})`));
    });

    this.client.on("messageCreate", async (message) => {
      if (message.author.bot) return;

      const isDM = message.channel.type === 1; // DM channel type
      const isAllowedChannel =
        this.allowedChannels.length > 0 &&
        this.allowedChannels.includes(message.channel.id);

      // Only respond to DMs (default) or explicitly allowed channels
      if (!isDM && !isAllowedChannel) return;

      // In servers, require prefix
      if (!isDM) {
        const prefix = this.config.discord.prefix || "!";
        if (!message.content.startsWith(prefix)) return;
        message.content = message.content.slice(prefix.length).trim();
      }

      const text = message.content.trim();
      if (!text) return;

      const channelKey = message.channel.id;
      const savedHistory = this.hamster.conversationHistory;
      this.hamster.conversationHistory = this.perChannelHistory[channelKey] || [];

      try {
        await message.channel.sendTyping();

        const reply = await this.hamster.chat(text);
        this.perChannelHistory[channelKey] = [...this.hamster.conversationHistory];

        // Discord has 2000 char limit — split if needed
        if (reply.length <= 2000) {
          await message.reply(reply);
        } else {
          const chunks = reply.match(/[\s\S]{1,1990}/g) || [reply];
          for (const chunk of chunks) {
            await message.channel.send(chunk);
          }
        }
      } catch (err) {
        console.error(chalk.red(`Discord error: ${err.message}`));
        await message.reply(`⚠️ ${err.message}`);
      } finally {
        this.hamster.conversationHistory = savedHistory;
      }
    });

    this.client.login(this.config.discord.token);
  }

  stop() {
    if (this.client) this.client.destroy();
  }
}
