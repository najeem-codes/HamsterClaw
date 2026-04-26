// tools.js — Hamster tool execution engine
// Hamster proposes a command → user confirms → it runs
// Blocked commands: rm -rf, format, shutdown, and other destructive ops

import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";

const execAsync = promisify(exec);

// ── Blocklist ──────────────────────────────────────────────────────────────
const BLOCKED_PATTERNS = [
  /\brm\s+(-\S*[rf]\S*\s+)+[\/~*]/i,           // rm -rf /, rm -fr ~, rm -rf *
  /\brm\s+(-\S*[rf]\S*\s*){2,}/i,               // rm -r -f variants
  /(^|[;&|`])\s*(\/bin\/|\/usr\/bin\/)?rm\s+.*-[^\s]*r/i, // /bin/rm -r or chained rm
  /rmdir\s+\/s/i,
  /format\s+[a-z]:/i,
  /\b(shutdown|reboot|poweroff|halt)\b/i,
  /del\s+\/[sf]/i,
  /:\(\)\s*\{.*\}/,                              // fork bomb
  /\bmkfs\b/i,
  /dd\s+if=.*of=\/dev/i,
  /(curl|wget)[^|]*\|\s*(bash|sh|zsh|fish|python\d*|perl|ruby)\b/i,
  />\s*\/dev\/(s|h|nv)d[a-z]/i,                 // writing to block devices
  /\bsudo\s+(rm|rmdir|mkfs|dd|format|shutdown|reboot|poweroff|halt)\b/i,
];

function isBlocked(command) {
  return BLOCKED_PATTERNS.some((p) => p.test(command));
}

// ── Read a single keypress from stdin without readline ─────────────────────
// This avoids the Git Bash / readline conflict entirely.
function waitForKey() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasTTY = stdin.isTTY;
    let buf = "";

    const cleanup = (result) => {
      stdin.removeListener("data", onData);
      if (wasTTY) stdin.setRawMode(false);
      stdin.pause();
      resolve(result);
    };

    const onData = (chunk) => {
      const str = chunk.toString();
      for (const ch of str) {
        if (ch === "\n" || ch === "\r") {
          cleanup(buf.trim().toLowerCase());
          return;
        }
        if (ch === "\x7f" || ch === "\b") {
          buf = buf.slice(0, -1);
        } else if (ch >= " ") {
          process.stdout.write(ch);
          buf += ch;
        }
      }
    };

    if (wasTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

// ── Run the command ────────────────────────────────────────────────────────
async function runCommand(command, workingDir) {
  // Sanitise cwd: convert Windows backslashes, handle spaces
  let cwd = workingDir || process.cwd();
  // If cwd looks like a Windows path (C:\...), convert to forward slashes
  cwd = cwd.replace(/\\/g, "/");

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      shell: true,
      timeout: 30000,
    });
    return {
      success: true,
      output: (stdout + stderr).trim() || "(command completed with no output)",
    };
  } catch (err) {
    return {
      success: false,
      output: err.message,
    };
  }
}

// ── Parse <<<TOOL:command>>> or <<<TOOL:command|cwd:/path>>> ───────────────
export function parseToolCalls(reply) {
  const regex = /<<<TOOL:([\s\S]*?)>>>/g;
  const tools = [];
  let match;
  while ((match = regex.exec(reply)) !== null) {
    const raw = match[1];
    const pipeIdx = raw.lastIndexOf("|cwd:");
    if (pipeIdx !== -1) {
      tools.push({
        command: raw.slice(0, pipeIdx).trim(),
        cwd: raw.slice(pipeIdx + 5).trim(),
        raw: match[0],
      });
    } else {
      tools.push({ command: raw.trim(), cwd: null, raw: match[0] });
    }
  }
  return tools;
}

// ── Strip tool markers from display text ───────────────────────────────────
export function stripToolCalls(reply) {
  return reply.replace(/<<<TOOL:[\s\S]*?>>>/g, "").trim();
}

// ── Main: confirm and execute each tool call ───────────────────────────────
export async function handleToolCalls(tools) {
  const results = [];

  for (const tool of tools) {
    const { command, cwd } = tool;

    if (isBlocked(command)) {
      console.log(chalk.red(`\n  ⛔ Blocked: "${command}" — not allowed.\n`));
      results.push({ command, success: false, output: "Blocked by safety filter." });
      continue;
    }

    // Show the proposed command
    console.log(chalk.yellow("\n  🐹 wants to run:"));
    console.log(chalk.white(`     ${command}`));
    if (cwd) console.log(chalk.dim(`     in: ${cwd}`));
    process.stdout.write(chalk.cyan("\n  Run it? [y/N] "));

    // Wait for keypress — bypasses readline entirely
    const answer = await waitForKey();
    process.stdout.write("\n");

    if (answer !== "y") {
      console.log(chalk.dim("  Skipped.\n"));
      results.push({ command, success: false, output: "User declined." });
      continue;
    }

    console.log(chalk.dim("  Running..."));
    const result = await runCommand(command, cwd);

    if (result.success) {
      console.log(chalk.green("  ✓ Done"));
    } else {
      console.log(chalk.red("  ✗ Failed"));
    }

    if (result.output && result.output !== "(command completed with no output)") {
      console.log(chalk.dim(`\n  Output:\n  ${result.output.split("\n").join("\n  ")}\n`));
    } else {
      console.log();
    }

    results.push({ command, ...result });
  }

  return results;
}

// ── Build result summary to feed back into conversation ───────────────────
export function buildToolResultMessage(results) {
  if (results.length === 0) return null;
  const lines = results.map((r) =>
    `Command: ${r.command}\nResult: ${r.success ? "success" : "failed"}\nOutput: ${r.output}`
  );
  return `Tool execution results:\n${lines.join("\n---\n")}`;
}
