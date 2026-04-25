// config.js — loads and validates hamster.config.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../config/hamster.config.json");

const DEFAULTS = {
  ollama: {
    baseUrl: "http://localhost:11434",
    model: "llama3.2",
  },
  telegram: { enabled: false, token: null },
  discord: { enabled: false, token: null, prefix: "!" },
  voice: { enabled: false, whisperModel: "base" },
  user: { name: null },
};

export async function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    // First run — return defaults, setup wizard will write the real config
    return structuredClone(DEFAULTS);
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const userConfig = JSON.parse(raw);
    // Deep merge: user config takes priority over defaults
    return deepMerge(DEFAULTS, userConfig);
  } catch (err) {
    throw new Error(`Config parse error: ${err.message}`);
  }
}

export function saveConfig(config) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key]) &&
      base[key] &&
      typeof base[key] === "object"
    ) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}
