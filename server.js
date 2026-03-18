/**
 * JClaw - LINE-native AI Agent powered by local LLM
 * Japan's first LINE Official SDK + Ollama integration
 * © iHouse Japan - MIT License
 */

import express from 'express';
import { messagingApi, middleware, HTTPFetchError } from '@line/bot-sdk';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// --- Config ---
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:14b';
const PORT = process.env.PORT || 3001;

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  'あなたはiHouse Japanが開発したAIアシスタント「JClaw」です。日本語・英語・中国語で丁寧に対応してください。簡潔で実用的な回答を心がけてください。';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// --- Conversation Memory (in-process, per userId) ---
const conversations = new Map();
const MAX_HISTORY = 20;

function getHistory(userId) {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  return conversations.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
}

// --- Ollama Chat ---
async function chatWithOllama(userId, userMessage) {
  addToHistory(userId, 'user', userMessage);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...getHistory(userId),
  ];

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 1024,
        },
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Ollama error ${response.status}: ${errText}`);
      return `⚠️ AI処理エラー (${response.status})`;
    }

    const data = await response.json();
    let reply = data.message?.content || 'No response';
    reply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    addToHistory(userId, 'assistant', reply);

    if (data.eval_count && data.eval_duration) {
      const tps = (data.eval_count / (data.eval_duration / 1e9)).toFixed(1);
      console.log(`[${OLLAMA_MODEL}] ${data.eval_count} tokens @ ${tps} t/s`);
    }

    return reply;
  } catch (err) {
    console.error('Ollama request failed:', err.message);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return '⚠️ AIの応答がタイムアウトしました。もう一度お試しください。';
    }
    return `⚠️ AIサーバー接続エラー: ${err.message}`;
  }
}

// --- LINE Webhook Handler ---
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }

  const userId = event.source.userId;
  const userText = event.message.text.trim();

  if (userText === '/reset' || userText === '/リセット') {
    conversations.delete(userId);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🔄 会話履歴をリセットしました。' }],
    });
  }

  if (userText === '/status') {
    const history = getHistory(userId);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{
        type: 'text',
        text: `📊 JClaw Status\nModel: ${OLLAMA_MODEL}\nOllama: ${OLLAMA_HOST}\nHistory: ${history.length}/${MAX_HISTORY} turns`,
      }],
    });
  }

  console.log(`[${userId.slice(0,8)}...] ${userText}`);
  const aiReply = await chatWithOllama(userId, userText);

  const messages = [];
  if (aiReply.length <= 5000) {
    messages.push({ type: 'text', text: aiReply });
  } else {
    for (let i = 0; i < aiReply.length; i += 5000) {
      messages.push({ type: 'text', text: aiReply.slice(i, i + 5000) });
      if (messages.length >= 5) break;
    }
  }

  return client.replyMessage({
    replyToken: event.replyToken,
    messages,
  });
}

// --- Express App ---
const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    model: OLLAMA_MODEL,
    ollama: OLLAMA_HOST,
    uptime: process.uptime(),
    conversations: conversations.size,
  });
});

app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const results = await Promise.allSettled(
      req.body.events.map(handleEvent)
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`Event ${i} failed:`, r.reason);
    });
    res.json({ results: results.map(r => r.status) });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use((req, res) => {
  res.status(200).json({
    name: 'JClaw',
    description: 'LINE-native AI Agent powered by local LLM',
    webhook: '/webhook',
    health: '/health',
  });
});

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🐾 JClaw is running on port ${PORT}`);
  console.log(`🦙 Ollama: ${OLLAMA_HOST} (${OLLAMA_MODEL})`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
  console.log('='.repeat(50));
});
