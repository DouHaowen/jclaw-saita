/**
 * JClaw - LINE-native AI Agent powered by local LLM
 * Japan's first LINE Official SDK + Ollama + SearXNG integration
 * Free web search via self-hosted SearXNG (no API key needed)
 * © iHouse Japan - MIT License
 * https://github.com/iHouse-japan/jclaw
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
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://localhost:8899';

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ||
  'あなたはJClawです。LINE上で動作するAIアシスタントです。日本語・英語・中国語で丁寧に対応してください。簡潔で実用的な回答を心がけてください。Web検索結果が提供された場合は、その情報を元に正確に回答してください。';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// --- Web Search ---
const SEARCH_KW_JA = ['最新','今日','ニュース','天気','株価','検索','調べ','現在','今年','2025','2026','いくら','何時','速報','誰','どこ'];
const SEARCH_KW_ZH = ['最新','今天','新闻','天气','搜索','查一下','现在','今年','多少钱','股价','谁是','哪里'];
const SEARCH_KW_EN = ['latest','today','news','weather','stock','search','current','price','2025','2026','how much','who is','what is','where is'];

function needsSearch(text) {
  const t = text.toLowerCase();
  if (t.startsWith('/search ') || t.startsWith('/検索 ') || t.startsWith('/搜索 ')) return true;
  const allKW = [...SEARCH_KW_JA, ...SEARCH_KW_ZH, ...SEARCH_KW_EN];
  return allKW.some(kw => t.includes(kw.toLowerCase()));
}

async function webSearch(query, maxResults = 5) {
  try {
    console.log('[SearXNG] ' + query);
    const url = SEARXNG_URL + '/search?q=' + encodeURIComponent(query) + '&format=json&categories=general';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.error('[SearXNG] HTTP ' + res.status); return null; }
    const data = await res.json();
    const results = data.results || [];
    if (!results.length) return null;
    const items = results.slice(0, maxResults).map((r, i) => {
      return '[' + (i+1) + '] ' + (r.title || '') + '\n' + (r.content || '') + '\nURL: ' + (r.url || '');
    });
    console.log('[SearXNG] ' + items.length + ' results');
    return items.join('\n\n');
  } catch (e) {
    console.error('[SearXNG Error]', e.message);
    return null;
  }
}

function extractSearchQuery(text) {
  if (text.startsWith('/search ')) return text.slice(8).trim();
  if (text.startsWith('/検索 ')) return text.slice(4).trim();
  if (text.startsWith('/搜索 ')) return text.slice(4).trim();
  return text.replace(/[?？。！!]/g, '').trim();
}

// --- Conversation Memory ---
const conversations = new Map();
const MAX_HISTORY = 20;

function getHistory(userId) {
  if (!conversations.has(userId)) conversations.set(userId, []);
  return conversations.get(userId);
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  while (history.length > MAX_HISTORY) history.shift();
}

// --- Ollama Chat (with Web Search injection) ---
async function chatWithOllama(userId, userMessage) {
  addToHistory(userId, 'user', userMessage);

  let systemContent = SYSTEM_PROMPT;

  // Auto web search if keywords detected
  if (needsSearch(userMessage)) {
    const query = extractSearchQuery(userMessage);
    const searchResults = await webSearch(query);
    if (searchResults) {
      systemContent += '\n\n[Web Search Results]\n' + searchResults + '\n\n上記の検索結果を参考にして、正確で最新の情報に基づいて回答してください。情報源URLも含めてください。';
    }
  }

  const messages = [
    { role: 'system', content: systemContent },
    ...getHistory(userId),
  ];

  try {
    const response = await fetch(OLLAMA_HOST + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { temperature: 0.7, num_predict: 1024 },
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Ollama error ' + response.status + ': ' + errText);
      return 'AI処理エラー (' + response.status + ')';
    }

    const data = await response.json();
    let reply = data.message?.content || 'No response';
    reply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    addToHistory(userId, 'assistant', reply);

    if (data.eval_count && data.eval_duration) {
      const tps = (data.eval_count / (data.eval_duration / 1e9)).toFixed(1);
      console.log('[' + OLLAMA_MODEL + '] ' + data.eval_count + ' tokens @ ' + tps + ' t/s');
    }
    return reply;
  } catch (err) {
    console.error('Ollama request failed:', err.message);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return 'AIの応答がタイムアウトしました。もう一度お試しください。';
    }
    return 'AIサーバー接続エラー: ' + err.message;
  }
}

// --- LINE Webhook Handler ---
async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return null;

  const userId = event.source.userId;
  const userText = event.message.text.trim();

  // /reset command
  if (userText === '/reset' || userText === '/リセット') {
    conversations.delete(userId);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🔄 会話履歴をリセットしました。' }],
    });
  }

  // /status command
  if (userText === '/status') {
    const history = getHistory(userId);
    const statusText = '📊 JClaw Status\n'
      + 'Model: ' + OLLAMA_MODEL + '\n'
      + 'Ollama: ' + OLLAMA_HOST + '\n'
      + 'History: ' + history.length + '/' + MAX_HISTORY + ' turns\n'
      + '🔍 Web Search: ON (SearXNG self-hosted)\n\n'
      + 'Commands:\n'
      + '/search <query> - Web検索\n'
      + '/検索 <キーワード> - Web検索\n'
      + '/搜索 <关键词> - Web搜索\n'
      + '/reset - 履歴クリア\n'
      + '/status - システム情報';
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: statusText }],
    });
  }

  // /help command
  if (userText === '/help' || userText === '/ヘルプ') {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🐾 JClaw ヘルプ\n\n'
        + '普通に話しかけてください。AIが回答します。\n\n'
        + '🔍 検索機能:\n'
        + '「最新」「今日」「ニュース」等のキーワードで自動Web検索します。\n'
        + '/search 東京の天気 — 直接検索\n\n'
        + '⚙️ コマンド:\n'
        + '/reset — 会話リセット\n'
        + '/status — システム状態\n'
        + '/help — このヘルプ' }],
    });
  }

  console.log('[' + userId.slice(0,8) + '...] ' + userText);
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

  return client.replyMessage({ replyToken: event.replyToken, messages });
}

// --- Express App ---
const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok', model: OLLAMA_MODEL, ollama: OLLAMA_HOST,
    uptime: process.uptime(), conversations: conversations.size,
    webSearch: 'enabled (SearXNG self-hosted, free, unlimited)',
  });
});

app.post('/webhook', middleware(config), async (req, res) => {
  try {
    const results = await Promise.allSettled(req.body.events.map(handleEvent));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error('Event ' + i + ' failed:', r.reason);
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
    description: 'LINE-native AI Agent powered by local LLM + Web Search',
    webhook: '/webhook', health: '/health',
  });
});

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🐾 JClaw is running on port ' + PORT);
  console.log('🦙 Ollama: ' + OLLAMA_HOST + ' (' + OLLAMA_MODEL + ')');
  console.log('🔍 Web Search: SearXNG (self-hosted, free, unlimited)');
  console.log('📡 Webhook: http://localhost:' + PORT + '/webhook');
  console.log('='.repeat(50));
});
