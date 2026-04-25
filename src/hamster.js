// 🐹 HAMSTER — Local AI Assistant Core
// Runs entirely on your machine. Your data never leaves unless YOU connect it somewhere.

import fetch from "node-fetch";
import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { VoiceHandler } from "./voice.js";
import { loadConfig } from "./config.js";
import { parseToolCalls, stripToolCalls, handleToolCalls, buildToolResultMessage } from "./tools.js";

const HAMSTER_PERSONALITY = `You are Hamster — a compact, fast, slightly unhinged AI assistant who lives entirely on the user's local machine.

Your personality:
- You're a hamster. You occasionally reference running on your wheel, stuffing things in your cheeks, nibbling on data, etc. But never overdo it — one hamster reference per 4-5 messages max.
- You're direct, occasionally blunt, and genuinely useful. You don't pad responses with filler.
- You have opinions. If someone asks a bad question or has a flawed plan, you say so — kindly but clearly.
- You're fast and you know it. You take pride in running locally.
- You use dry humour. Not slapstick. The kind of wit that makes someone snort quietly.
- You never pretend to be more capable than you are. If you don't know something, say so directly.
- Short responses by default. Expand when depth is needed. Never ramble.

## TOOL USE — FILE SYSTEM AND SHELL COMMANDS

You can execute commands on the user's machine. Use this capability when the user asks you to create files, folders, run scripts, or do anything on their computer.

To run a command, wrap it in triple angle brackets like this:
<<<TOOL:mkdir my-folder>>>
<<<TOOL:echo "hello world" > my-folder/notes.txt>>>

Rules:
- Always tell the user what you are about to do and why, BEFORE the tool call.
- Each <<<TOOL:...>>> block is ONE command. Use multiple blocks for multiple commands.
- For Windows users in Git Bash, use bash/unix commands (mkdir, touch, echo, ls, cat, cp, mv).
- To specify a working directory: <<<TOOL:mkdir projects|cwd:C:/Users/najee/Desktop>>>
- After tool results come back, confirm what happened or explain any errors.
- Never run destructive commands (rm -rf, format, delete system files) — the system will block them anyway.
- If unsure what directory to use, ask the user first.

Current context: {context}`;

export class HamsterAssistant {
  constructor() {
    this.config = null;
    this.conversationHistory = [];
    this.voice = null;
    this.maxHistory = 20;
    this.rl = null;
  }

  async init() {
    this.config = await loadConfig();
    if (this.config.voice?.enabled) {
      this.voice = new VoiceHandler(this.config);
    }
  }

  buildSystemPrompt() {
    const context = [
      `Time: ${new Date().toLocaleString()}`,
      `Model: ${this.config.ollama.model}`,
      this.config.user?.name ? `User: ${this.config.user.name}` : null,
      `OS: Windows (Git Bash)`,
    ]
      .filter(Boolean)
      .join(", ");
    return HAMSTER_PERSONALITY.replace("{context}", context);
  }

  async chat(userMessage) {
    if (this.conversationHistory.length > this.maxHistory * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory * 2);
    }

    this.conversationHistory.push({ role: "user", content: userMessage });

    const messages = [
      { role: "system", content: this.buildSystemPrompt() },
      ...this.conversationHistory,
    ];

    try {
      const response = await fetch(`${this.config.ollama.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.ollama.model,
          messages,
          stream: false,
          options: {
            temperature: 0.75,
            top_p: 0.9,
            num_predict: 512,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Ollama error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const reply = data.message?.content || "*(no response)*";

      this.conversationHistory.push({ role: "assistant", content: reply });
      return reply;
    } catch (err) {
      if (err.code === "ECONNREFUSED") {
        throw new Error("Can't reach Ollama. Is it running? Try: ollama serve");
      }
      throw err;
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  async startCLI() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow("\n🐹 Hamster is awake and on the wheel.\n"));
    console.log(chalk.dim("  Commands: /clear  /history  /model  /quit\n"));

    const ask = () => {
      this.rl.question(chalk.cyan("you › "), async (input) => {
        const msg = input.trim();
        if (!msg) return ask();

        if (msg === "/quit") {
          console.log(chalk.yellow("\n🐹 *stuffs last thought in cheek* Bye.\n"));
          this.rl.close();
          process.exit(0);
        }
        if (msg === "/clear") {
          this.clearHistory();
          console.log(chalk.dim("  History cleared.\n"));
          return ask();
        }
        if (msg === "/history") {
          console.log(chalk.dim(`  ${this.conversationHistory.length / 2} exchanges in memory.\n`));
          return ask();
        }
        if (msg === "/model") {
          console.log(chalk.dim(`  Running: ${this.config.ollama.model}\n`));
          return ask();
        }

        const spinner = ora({ text: "", color: "yellow" }).start();
        try {
          const reply = await this.chat(msg);
          spinner.stop();

          // Check for tool calls in Hamster's reply
          const tools = parseToolCalls(reply);
          const displayReply = stripToolCalls(reply);

          // Show Hamster's text first
          if (displayReply) {
            console.log(chalk.yellow("\n🐹 › ") + displayReply + "\n");
          }

          // Execute any tool calls with confirmation
          if (tools.length > 0) {
            const results = await handleToolCalls(tools);

            // Feed results back so Hamster can confirm or explain
            const resultMsg = buildToolResultMessage(results);
            if (resultMsg) {
              const followUp = await this.chat(resultMsg);
              const followUpClean = stripToolCalls(followUp);
              if (followUpClean) {
                console.log(chalk.yellow("🐹 › ") + followUpClean + "\n");
              }
            }
          }
        } catch (err) {
          spinner.stop();
          console.log(chalk.red(`\n  Error: ${err.message}\n`));
        }

        ask();
      });
    };

    ask();
  }
}
