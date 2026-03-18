# JClaw

> **Japan's first LINE-native AI Agent, powered by local LLM**
> **日本初・LINE公式SDK対応のローカルLLM AIエージェント**

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
| 🔄 **Special Commands** | `/reset` to clear history, `/status` to check system |

---

### 🚀 Quick Start

#### Prerequisites

- Node.js 20+
- [Ollama](https://ollama.ai) installed and running
- `qwen3:14b` model pulled (`ollama pull qwen3:14b`)
- LINE Developer account + Messaging API channel
- A public HTTPS endpoint (e.g. ngrok for dev, VPS for production)

#### Steps

```bash
git clone https://github.com/iHouse-japan/jclaw.git
cd jclaw
npm install
cp .env.example .env
# Fill in LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN
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

---

## 🇯🇵 日本語

### JClawとは？

JClawは、**LINE Messaging API**にネイティブ対応した完全自己ホスト型のオープンソースAIエージェントです。**Ollama**を使ってローカルLLM（例：`qwen3:14b`）をサーバー上で直接実行するため、**APIコスト完全ゼロ**・**外部AIサービス依存なし**・**データ完全ローカル保持**を実現しています。

開発・メンテナンス：[iHouse Japan](https://github.com/iHouse-japan)

### 📄 ライセンス

MIT © [iHouse Japan](https://github.com/iHouse-japan)
