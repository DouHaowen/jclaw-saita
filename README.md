# JClaw

<p align="center">
  <img src="logo.png" alt="JClaw Logo" width="400"/>
</p>

> **Japan's first LINE-native AI Agent, powered by local LLM**
> **日本初・LINE公式SDK対応のローカルLLM AIエージェント**

<p align="center">
  <img src="https://img.shields.io/badge/LINE-Official%20SDK-06C755?style=for-the-badge&logo=line&logoColor=white"/>
  <img src="https://img.shields.io/badge/Ollama-Local%20LLM-black?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/API%20Cost-Zero-brightgreen?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge"/>
</p>

---

## 🇬🇧 English

### What is JClaw?

JClaw is an open-source AI Agent that runs entirely on your own server, integrated natively with the **LINE Messaging API**. It uses **Ollama** to serve local large language models (e.g. `qwen3:14b`), meaning **zero API costs**, **zero third-party dependencies**, and **complete data sovereignty** — all messages stay on your machine.

Built and maintained by [iHouse Japan](https://github.com/iHouse-japan).

---

### ✨ Features

| Feature | Detail |
|---|---|
| 🟢 **LINE Official SDK** | Uses the official `@line/bot-sdk` — fully compliant, production-ready |
| 🏠 **Local LLM via Ollama** | Runs `qwen3:14b` (or any Ollama model) on your own hardware |
| 💰 **Zero API Cost** | No OpenAI, no Anthropic, no Claude API fees |
| 🔒 **Zero Third-Party Dependencies** | No external AI services. Your data never leaves your server |
| 📦 **Data Fully Local** | All conversation data stored and processed on-premises |
| ⚡ **Lightweight & Fast** | Minimal stack — Node.js + Express + Ollama |
| 💬 **Conversation Memory** | Per-user chat history maintained across messages |
| 🔍 **Web Search (SearXNG)** | Free, unlimited web search via self-hosted SearXNG — no API key needed |
| 🔄 **Special Commands** | `/reset` `/status` `/help` `/search <query>` `/検索` `/搜索` |

---

### 🚀 Quick Start

#### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) installed and running
- `qwen3:14b` model pulled (`ollama pull qwen3:14b`)
- [Docker](https://docker.com) (for SearXNG web search)
- LINE Developer account + Messaging API channel
- A public HTTPS endpoint (e.g. ngrok for dev, VPS for production)

#### Steps

```bash
git clone https://github.com/iHouse-japan/jclaw.git
cd jclaw
npm install
cp .env.example .env
# Fill in LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN

# Start SearXNG (free web search engine)
docker compose up -d searxng

# Start JClaw
npm start
```

---

### 🔑 Environment Variables

| Variable | Description | Example |
|---|---|---|
| `LINE_CHANNEL_SECRET` | LINE channel secret | `abc123...` |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE channel access token | `xyz789...` |
| `OLLAMA_HOST` | Ollama API base URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Model to use | `qwen3:14b` |
| `PORT` | Server port | `3001` |
| `SEARXNG_URL` | SearXNG search URL | `http://localhost:8899` |
| `SYSTEM_PROMPT` | Custom AI personality | `あなたは...` |

---

### 🔍 Web Search (v1.1)

JClaw automatically searches the web when it detects keywords like:
- 🇯🇵 `最新` `今日` `ニュース` `天気` `株価` `検索` `調べ`
- 🇨🇳 `最新` `今天` `搜索` `查一下` `多少钱`
- 🇬🇧 `latest` `today` `news` `weather` `who is` `what is`

You can also force a search with commands:
```
/search Tokyo weather today
/検索 大阪 ラーメン おすすめ
/搜索 马斯克最新动态
```

Search results are injected into the LLM prompt, so the AI can answer with up-to-date information. Powered by self-hosted SearXNG. Aggregates Google, Bing, DuckDuckGo & more — free, unlimited, no API key.

---

## 🇯🇵 日本語

### JClawとは？

JClawは、**LINE Messaging API**にネイティブ対応した完全自己ホスト型のオープンソースAIエージェントです。**Ollama**を使ってローカルLLM（例：`qwen3:14b`）をサーバー上で直接実行するため、**APIコスト完全ゼロ**・**外部AIサービス依存なし**・**データ完全ローカル保持**を実現しています。v1.1より**SearXNG Web検索（自己ホスト型・無料・無制限）**に対応し、最新情報に基づいた回答が可能になりました。

開発・メンテナンス：[iHouse Japan](https://github.com/iHouse-japan)

### 📄 ライセンス

MIT © [iHouse Japan](https://github.com/iHouse-japan)
