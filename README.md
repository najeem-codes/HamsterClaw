# 🐹 Hamster — Local AI Assistant

A private, fast AI assistant that runs entirely on your machine. No cloud required. Your data stays yours.

---

## What this actually is (and isn't)

**What runs locally:**
- The LLM (via Ollama) — your conversation never leaves your machine
- Voice transcription (via Whisper) — audio processed locally
- The Hamster process itself

**What doesn't stay local:**
- **Telegram**: Messages transit Telegram's servers. Unavoidable with any Telegram bot.
- **Discord**: Messages transit Discord's servers. Same deal.
- WhatsApp and Slack are not included. WhatsApp bots require Meta's Business API (your messages go to Meta) or violate ToS. Slack requires a workspace server. Neither is worth the tradeoff.

If you want *truly* local chat, use the CLI or voice endpoint over Tailscale.

---

## Requirements

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Ollama | Latest | [ollama.com](https://ollama.com) |
| Whisper | Optional | For voice input |
| Tailscale | Optional | For mobile access |

---

## Quick start

```bash
# 1. Clone / download this folder
cd hamster

# 2. Install dependencies
npm install

# 3. Install Ollama and pull a model
# macOS:  brew install ollama
# Linux:  curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2        # fast, good quality (~2GB)
# ollama pull mistral       # alternative
# ollama pull phi3:mini     # smaller, faster

# 4. Start Ollama in the background
ollama serve &

# 5. Run setup wizard (one time)
npm run setup

# 6. Start Hamster
npm start
```

That's it. The CLI is immediately usable. Telegram/Discord start automatically if configured.

---

## CLI commands

| Command | What it does |
|---------|-------------|
| `/clear` | Wipe conversation history |
| `/history` | Show how many exchanges are in memory |
| `/model` | Show which model is running |
| `/quit` | Exit |

---

## Telegram setup

1. Open Telegram and message `@BotFather`
2. Send `/newbot` — follow the prompts
3. Copy the token (looks like `123456789:ABCdef...`)
4. Run `npm run setup` and paste it in

**Security**: By default any Telegram user can reach your bot if they know the username. To restrict access, add your Telegram user ID to `allowedUserIds` in `config/hamster.config.json`:

```json
"telegram": {
  "enabled": true,
  "token": "your-token",
  "allowedUserIds": [123456789]
}
```

To find your user ID: message `@userinfobot` on Telegram.

---

## Discord setup

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. New Application → Bot → Add Bot
3. Under **Bot > Privileged Gateway Intents**, enable **Message Content Intent**
4. Copy the bot token
5. Invite the bot to your server using OAuth2 → URL Generator:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Read Message History`, `Read Messages/View Channels`
6. Run `npm run setup` and paste the token

By default Hamster **only responds to DMs** from Discord — safer and simpler. To allow specific channels, add channel IDs to `config/hamster.config.json`:

```json
"discord": {
  "enabled": true,
  "token": "your-token",
  "prefix": "!",
  "dmOnly": false,
  "allowedChannelIds": ["1234567890123456789"]
}
```

---

## Voice setup

### Desktop (macOS/Linux)

```bash
# Option A: Python Whisper
pip install openai-whisper

# Option B: whisper.cpp (faster, no Python needed)
# macOS: brew install whisper-cpp
# Linux: https://github.com/ggerganov/whisper.cpp
```

Enable in setup wizard and choose your model:
- `tiny` — fastest, least accurate (~75MB)
- `base` — good balance (~150MB) — recommended
- `small` — better accuracy (~500MB)
- `medium` — very good, slower (~1.5GB)

### Mobile — iPhone (Siri Shortcut)

Hamster's voice server runs on `http://127.0.0.1:8765` by default. To reach it from your phone you need to expose it over your local network. **Tailscale is strongly recommended** (traffic stays on your devices; it's a private VPN mesh).

1. Install [Tailscale](https://tailscale.com) on your computer and iPhone
2. Note your computer's Tailscale IP (e.g., `100.x.x.x`)
3. In Hamster config, change voice server to listen on `0.0.0.0` instead of `127.0.0.1` (edit `voice.js` line with `server.listen`)
4. Create a Siri Shortcut:
   - **Dictate Text** — captures your voice
   - **Get Contents of URL** — POST to `http://100.x.x.x:8765/text` with JSON body `{"message": "[Dictated Text]"}`
   - **Get Value** from JSON response — key: `reply`
   - **Speak Text** — reads Hamster's reply aloud
5. Add the shortcut to your home screen or assign it to "Hey Siri, ask Hamster"

### Mobile — Android (Tasker)

1. Install Tasker + AutoVoice
2. Create a task:
   - AutoVoice Recognize → captures speech
   - HTTP Request → POST `http://100.x.x.x:8765/text`, body: `{"message": "%avr_last_result"}`
   - Parse JSON → extract `reply`
   - Say (TTS) → speaks the reply

---

## Config reference

`config/hamster.config.json`

```json
{
  "ollama": {
    "baseUrl": "http://localhost:11434",
    "model": "llama3.2"
  },
  "telegram": {
    "enabled": false,
    "token": null,
    "allowedUserIds": []
  },
  "discord": {
    "enabled": false,
    "token": null,
    "prefix": "!",
    "dmOnly": true,
    "allowedChannelIds": []
  },
  "voice": {
    "enabled": false,
    "whisperModel": "base",
    "whisperBin": "whisper",
    "httpPort": 8765
  },
  "user": {
    "name": null
  }
}
```

---

## Troubleshooting

**"Can't reach Ollama"**
```bash
ollama serve   # start Ollama
ollama list    # verify models are installed
```

**Telegram bot not responding**
- Check the token is correct
- Make sure the bot is not paused (send `/start` to it)
- Check your `allowedUserIds` isn't blocking you

**Discord: "Used disallowed intents"**
- Go to your app in Discord Developer Portal
- Bot → Privileged Gateway Intents → enable **Message Content Intent**

**Voice: "Whisper not found"**
```bash
which whisper           # check if installed
pip install openai-whisper
```

---

## Model recommendations

| Model | Size | Use case |
|-------|------|----------|
| `llama3.2` | 2GB | Best all-rounder |
| `mistral` | 4GB | Strong reasoning |
| `phi3:mini` | 2.3GB | Fast, efficient |
| `llama3.2:1b` | 1.3GB | Fastest, weaker |

Run `ollama list` to see what you have installed.

---

## Privacy summary

| Feature | Stays local? | Why |
|---------|-------------|-----|
| LLM inference | ✅ Yes | Ollama runs on your machine |
| CLI chat | ✅ Yes | No network involved |
| Voice transcription | ✅ Yes | Whisper runs locally |
| Telegram messages | ⚠️ Partial | Text transits Telegram's servers |
| Discord messages | ⚠️ Partial | Text transits Discord's servers |
| Config & tokens | ✅ Yes | Stored in local JSON only |
