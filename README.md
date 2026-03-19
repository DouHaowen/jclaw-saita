# 🐾 JClaw v2.1 — LINE AI Agent with Tier S Memory

<div align="center">

**Japan's first LINE-native AI Agent with Tier S memory system.**

🧠 Knowledge Graph + Vector Search | 🔍 Self-hosted Web Search | 💰 Zero API Cost | 🔒 Owner Mode

[Website](https://jclaw.1d1s.com) · [Web Chat](https://chat.1d1s.com) · [龙虾大全](https://longxia.1d1s.com) · [ROBO COMPARE](https://1d1s.com/robo/)

</div>

## What's New in v2.1

- 🔒 **Owner-Only Mode** — Lock your bot to your LINE account only. Other users see "🔒 オーナー専用モード"
- `/setowner` — First user to run this becomes the owner
- `/whoami` — Show your LINE userId
- 🌐 **Web Chat** — `chat.1d1s.com` — PWA, no LINE message limits, works on any browser
- 📝 **Updated System Prompt** — JClaw now accurately describes its own capabilities, no hallucinated features
- 🧠 **Per-user Memory Isolation** — Each LINE user gets their own memory space, never cross-contaminated

## Features

### Core
- 💬 **LINE Official SDK** — `@line/bot-sdk`, production-ready, 200M+ users
- 🏠 **Local LLM** — Ollama (qwen3:14b or any model), zero cloud dependency
- 🌏 **Trilingual** — Japanese, English, Chinese auto-detection

### v2.0+ Memory System (Tier S)
- 🧠 **13 Memory Types** — Fact, decision, preference, relationship, insight, procedure, event...
- 🕸️ **Knowledge Graph** — Neo4j + Graphiti temporal graph (entity relationships + causality)
- 🔍 **Vector Search** — Qdrant 768-dim + nomic-embed-text (meaning, not keywords)
- 📊 **AMA-Bench** — 0.5722 score (2.7x better than Mem0's 0.2104)

### Web Search
- 🔍 **SearXNG** — Self-hosted, aggregates Google/Bing/DuckDuckGo
- 🤖 **Auto-detect** — Keywords like "最新", "天気", "news" trigger search automatically
- 💰 **Free & Unlimited** — No API key, no rate limits

### Security
- 🔒 **Owner-Only Mode** — Restrict bot access to owner's LINE account
- 🧠 **Per-user Memory** — Each user's memories are completely isolated
- 🏠 **100% Self-hosted** — Data never leaves your server

## Commands

| Command | Description |
|---------|-------------|
| `/search <query>` | Force web search (English) |
| `/検索 <keyword>` | Web search (Japanese) |
| `/搜索 <keyword>` | Web search (Chinese) |
| `/reset` | Reset conversation history |
| `/status` | System status & links |
| `/help` | Show help |
| `/whoami` | Show your LINE userId |
| `/setowner` | Set yourself as bot owner (first-use only) |

## Architecture

```
LINE User → VPS (JClaw Node.js :3001)
              ├── SSH Tunnel → Ollama qwen3:14b     (LLM)
              ├── SSH Tunnel → SearXNG              (Web search)
              └── SSH Tunnel → memclawz v9.1        (Memory)
                                 ├── Qdrant         (vector 768-dim)
                                 ├── Neo4j          (knowledge graph)
                                 └── Ollama         (enrichment)
```

## Quick Start

```bash
# Clone & install
git clone https://github.com/iHouse-japan/jclaw.git
cd jclaw && npm install && cp .env.example .env
# Edit .env with your LINE credentials

# Start search + memory services (Docker)
docker compose up -d searxng
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=none neo4j:5-community

# Pull local LLM model & launch
ollama pull qwen3:14b && npm start
# 🐾 JClaw v2.1 running — Tier S memory + Owner mode enabled
```

For OpenAI-compatible APIs, set these in `.env` instead of relying on local Ollama:

```bash
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.ihousejapan.cn
LLM_MODEL=your-model-name
LLM_API_KEY=sk-xxxx
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LINE_CHANNEL_SECRET` | LINE channel secret (required) | — |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE access token (required) | — |
| `LLM_PROVIDER` | `ollama` or `openai-compatible` | `ollama` |
| `LLM_BASE_URL` | LLM API base URL | `http://localhost:11434` |
| `LLM_MODEL` | LLM model name | `qwen3:14b` |
| `LLM_API_KEY` | API key for OpenAI-compatible providers | — |
| `OLLAMA_HOST` | Ollama API URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | LLM model name | `qwen3:14b` |
| `PORT` | Server port | `3001` |
| `SEARXNG_URL` | SearXNG search URL | `http://localhost:8899` |
| `MEMCLAWZ_URL` | memclawz memory API | `http://localhost:3500` |
| `OWNER_ONLY` | Restrict to owner only | `false` |
| `OWNER_USER_ID` | Owner's LINE userId | — |

## Memory Comparison

| Agent | Persistent | Vector | Graph | Multi-hop | Cost |
|-------|-----------|--------|-------|-----------|------|
| **JClaw v2.1** | ✅ | ✅ | ✅ | ✅ | $0 |
| OpenClaw | ✅ | ✅ | ❌ | ❌ | API fees |
| Mem0 | ✅ | ✅ | $249/m | $249/m | $19-249/m |
| ChatGPT | ✅ | ❌ | ❌ | ❌ | $20/m |
| Dify | ❌ | ❌ | ❌ | ❌ | Plugin |

## Links

- 🌐 [jclaw.1d1s.com](https://jclaw.1d1s.com) — Official website
- 💬 [chat.1d1s.com](https://chat.1d1s.com) — Web chat (PWA)
- 🦞 [longxia.1d1s.com](https://longxia.1d1s.com) — 龙虾大全 AI Agent Directory
- 🤖 [1d1s.com/robo/](https://1d1s.com/robo/) — ROBO COMPARE

## License

MIT — Built by [iHouse Japan](https://github.com/iHouse-japan) 🇯🇵 Osaka

Memory powered by [memclawz](https://github.com/yoniassia/memclawz)
