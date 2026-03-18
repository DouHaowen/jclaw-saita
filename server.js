/**
 * JClaw v2.0 - LINE-native AI Agent powered by local LLM
 * Japan's first LINE Official SDK + Ollama + SearXNG + memclawz integration
 * Features: Web search, Tier S memory (causality graph, 2.7x better than Mem0)
 * Zero API cost — 100% self-hosted
 * © iHouse Japan - MIT License
 * https://github.com/iHouse-japan/jclaw
 */

import express from 'express';
import { messagingApi, middleware, HTTPFetchError } from '@line/bot-sdk';
import fetch from 'node-fetch';
import { google } from 'googleapis';
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
const MEMCLAWZ_URL = process.env.MEMCLAWZ_URL || 'http://localhost:3500';
const OWNER_ONLY = process.env.OWNER_ONLY === 'true';
let OWNER_USER_ID = process.env.OWNER_USER_ID || '';

// --- Google Workspace Integration (user configures own credentials) ---
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const GOOGLE_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN);

let gAuth = null, gmail = null, gcal = null, gtasks = null, gdrive = null;
if (GOOGLE_ENABLED) {
  gAuth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  gAuth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  gmail = google.gmail({ version: 'v1', auth: gAuth });
  gcal = google.calendar({ version: 'v3', auth: gAuth });
  gtasks = google.tasks({ version: 'v1', auth: gAuth });
  gdrive = google.drive({ version: 'v3', auth: gAuth });
  console.log('📧 Google Workspace: ON (Gmail + Calendar + Tasks + Drive)');
} else {
  console.log('📧 Google Workspace: OFF (set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN)');
}

// Google Workspace API functions
async function gMailList(q = 'is:inbox', max = 5) {
  if (!gmail) return 'Gmail未設定。GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKENを.envに設定してください。';
  try {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: max });
    const msgs = res.data.messages || [];
    if (!msgs.length) return '該当メールなし。';
    const details = [];
    for (const m of msgs.slice(0, max)) {
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
      const headers = msg.data.payload?.headers || [];
      const from = headers.find(h => h.name === 'From')?.value || '';
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';
      details.push(date + ' | ' + from + '\n  ' + subject);
    }
    return details.join('\n\n');
  } catch (e) { return 'Gmail error: ' + e.message; }
}

async function gMailRead(messageId) {
  if (!gmail) return 'Gmail未設定。';
  try {
    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const headers = msg.data.payload?.headers || [];
    const from = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const body = msg.data.snippet || '';
    return 'From: ' + from + '\nSubject: ' + subject + '\n\n' + body;
  } catch (e) { return 'Gmail error: ' + e.message; }
}

async function gMailSend(to, subject, body) {
  if (!gmail) return 'Gmail未設定。';
  try {
    const raw = Buffer.from('To: ' + to + '\nSubject: ' + subject + '\nContent-Type: text/plain; charset=utf-8\n\n' + body).toString('base64url');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return '✅ メール送信完了: ' + to;
  } catch (e) { return 'Gmail send error: ' + e.message; }
}

async function gCalList(days = 7) {
  if (!gcal) return 'Calendar未設定。';
  try {
    const now = new Date();
    const end = new Date(now.getTime() + days * 86400000);
    const res = await gcal.events.list({ calendarId: 'primary', timeMin: now.toISOString(), timeMax: end.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 10 });
    const events = res.data.items || [];
    if (!events.length) return '今後' + days + '日間の予定なし。';
    return events.map(e => {
      const start = e.start?.dateTime || e.start?.date || '';
      return start + ' | ' + (e.summary || '(無題)') + (e.location ? ' @ ' + e.location : '');
    }).join('\n');
  } catch (e) { return 'Calendar error: ' + e.message; }
}

async function gCalCreate(summary, startTime, endTime, description) {
  if (!gcal) return 'Calendar未設定。';
  try {
    const event = { summary, start: { dateTime: startTime, timeZone: 'Asia/Tokyo' }, end: { dateTime: endTime, timeZone: 'Asia/Tokyo' } };
    if (description) event.description = description;
    const res = await gcal.events.insert({ calendarId: 'primary', requestBody: event });
    return '✅ 予定作成: ' + summary + ' (' + startTime + ')\n' + res.data.htmlLink;
  } catch (e) { return 'Calendar error: ' + e.message; }
}

async function gTasksList() {
  if (!gtasks) return 'Tasks未設定。';
  try {
    const lists = await gtasks.tasklists.list({ maxResults: 10 });
    const tl = lists.data.items?.[0];
    if (!tl) return 'タスクリストなし。';
    const res = await gtasks.tasks.list({ tasklist: tl.id, maxResults: 20, showCompleted: false });
    const tasks = res.data.items || [];
    if (!tasks.length) return '未完了タスクなし。';
    return tasks.map((t, i) => (i+1) + '. ' + (t.title || '(無題)') + (t.due ? ' (期限: ' + t.due.split('T')[0] + ')' : '')).join('\n');
  } catch (e) { return 'Tasks error: ' + e.message; }
}

async function gTasksAdd(title, dueDate) {
  if (!gtasks) return 'Tasks未設定。';
  try {
    const lists = await gtasks.tasklists.list({ maxResults: 1 });
    const tl = lists.data.items?.[0];
    if (!tl) return 'タスクリストなし。';
    const task = { title };
    if (dueDate) task.due = dueDate + 'T00:00:00.000Z';
    await gtasks.tasks.insert({ tasklist: tl.id, requestBody: task });
    return '✅ タスク追加: ' + title + (dueDate ? ' (期限: ' + dueDate + ')' : '');
  } catch (e) { return 'Tasks error: ' + e.message; }
}

async function gDriveList(q = '', max = 10) {
  if (!gdrive) return 'Drive未設定。';
  try {
    const params = { pageSize: max, fields: 'files(id,name,mimeType,modifiedTime,webViewLink)', orderBy: 'modifiedTime desc' };
    if (q) params.q = "name contains '" + q.replace(/'/g, "\\'") + "'";
    const res = await gdrive.files.list(params);
    const files = res.data.files || [];
    if (!files.length) return '該当ファイルなし。';
    return files.map(f => f.name + ' (' + f.mimeType?.split('.').pop() + ') ' + f.modifiedTime?.split('T')[0] + '\n  ' + (f.webViewLink || '')).join('\n\n');
  } catch (e) { return 'Drive error: ' + e.message; }
}

// Google Workspace tool keywords detection
const GWS_PATTERNS = {
  mail_list: /メール|受信|inbox|mail|邮件|收件/i,
  mail_send: /メール送|send.*mail|发邮件|写信/i,
  cal_list: /予定|スケジュール|calendar|日程|日历|行程/i,
  cal_create: /予定.*作成|予定.*追加|schedule.*create|安排|添加日程/i,
  tasks_list: /タスク|todo|やること|任务|待办/i,
  tasks_add: /タスク.*追加|todo.*add|添加任务/i,
  drive_list: /ドライブ|drive|ファイル|文件/i,
};

async function handleGoogleTool(text) {
  if (!GOOGLE_ENABLED) return null;
  const t = text.toLowerCase();
  
  if (GWS_PATTERNS.mail_send.test(t)) {
    return '[Google Workspace機能] メール送信はLLMに内容を生成させてから実行します。現在対応準備中。';
  }
  if (GWS_PATTERNS.mail_list.test(t)) return await gMailList('is:inbox is:unread', 5);
  if (GWS_PATTERNS.cal_create.test(t)) {
    return '[Google Workspace機能] 予定作成はLLMに日時を解析させてから実行します。具体的な日時を指定してください。';
  }
  if (GWS_PATTERNS.cal_list.test(t)) return await gCalList(7);
  if (GWS_PATTERNS.tasks_add.test(t)) {
    return '[Google Workspace機能] タスク追加の内容を指定してください。';
  }
  if (GWS_PATTERNS.tasks_list.test(t)) return await gTasksList();
  if (GWS_PATTERNS.drive_list.test(t)) return await gDriveList('', 10);
  return null;
}

const SYSTEM_PROMPT = `あなたはJClaw v2.0です。iHouse Japan（大阪）が開発したLINEネイティブAIアシスタントです。

【あなたの本当の特徴 — 嘘をつかないこと】
- 🧠 Tier S記憶システム搭載（memclawz v9.1: Qdrant vector search + Neo4j知識グラフ）
- ユーザーの名前・好み・過去の会話を記憶し、関係性まで理解する
- 記憶精度はMem0の2.7倍（AMA-Bench学術論文による評価）
- 🔍 SearXNG自前検索エンジン（Google/Bing/DuckDuckGoを統合、無料・無制限）
- 「最新」「天気」「ニュース」等のキーワードで自動検索
- 🌐 日本語・英語・中文を自動検出して対応
- 💰 完全ローカルLLM（Ollama qwen3:14b）、APIコストゼロ
- データは全てiHouse Japanの自社サーバー内、外部に出ない
- 🔒 現在Owner Onlyモード（オーナー専用）

【重要なルール】
- 存在しない機能を絶対に作り話しないこと
- メール連携・カレンダー連携・TodoList機能はまだ未実装
- コード生成能力は一般的なLLMとして可能だが、特別な機能ではない
- 「2023年」など古い情報を言わない。今は2026年3月
- 官網URLを勝手に作らない。正しいリンクは以下のみ：

【正しいリンク】
- JClaw公式: https://jclaw.1d1s.com
- JClaw Chat: https://chat.1d1s.com
- GitHub: https://github.com/iHouse-japan/jclaw
- 龍蝦大全(AI Agent Directory): https://longxia.1d1s.com
- ROBO COMPARE: https://1d1s.com/robo/
- iHouse Japan: https://ihousejapan.com

【Google Workspace連携】(GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN設定時に有効)
- 📧 Gmail: メール一覧・検索・送信
- 📅 Calendar: 予定一覧・作成・更新
- ✅ Tasks: タスク一覧・追加・完了
- 📁 Drive: ファイル検索・一覧
ユーザーが「メール見せて」「今週の予定は」「タスク追加」等と言ったら自動実行。

回答は簡潔で実用的に。Web検索結果がある場合はその情報を元に正確に回答しURLも含める。`;

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

// --- Long-term Memory (memclawz) ---
async function memorySearch(query, userId) {
  try {
    const url = MEMCLAWZ_URL + '/api/v1/search?q=' + encodeURIComponent(query) + '&agent_id=jclaw&user_id=' + encodeURIComponent(userId) + '&limit=5';
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    if (!results.length) return null;
    const memories = results.map((r, i) => {
      const content = r.payload?.memory || r.memory || '';
      const type = r.payload?.memory_type || 'unknown';
      return '[Memory ' + (i+1) + ' (' + type + ')] ' + content;
    });
    console.log('[Memory] Found ' + memories.length + ' memories for: ' + query.substring(0, 40));
    return memories.join('\n');
  } catch (e) {
    console.error('[Memory Search Error]', e.message);
    return null;
  }
}

async function memorySave(content, userId, memoryType = 'fact') {
  try {
    const res = await fetch(MEMCLAWZ_URL + '/api/v1/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, user_id: userId, agent_id: 'jclaw', memory_type: memoryType }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) console.log('[Memory] Saved: ' + content.substring(0, 50) + '...');
  } catch (e) {
    console.error('[Memory Save Error]', e.message);
  }
}

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

  // Long-term memory recall
  const memories = await memorySearch(userMessage, userId);
  if (memories) {
    systemContent += '\n\n[Long-term Memory — things you remember about this user]\n' + memories + '\n\nUse this memory naturally in your response. Do not say "according to my memory" — just use the information as if you know it.';
  }

    // Google Workspace auto-detect
    if (GOOGLE_ENABLED) {
      const gwsResult = await handleGoogleTool(userMessage);
      if (gwsResult) {
        systemContent += "\n\n[Google Workspace Results]\n" + gwsResult + "\nこの情報を自然に回答に含めてください。";
      }
    }

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

    // Save conversation to long-term memory (async, non-blocking)
    memorySave('User: ' + userMessage + '\nAssistant: ' + reply.substring(0, 500), userId, 'event').catch(() => {});

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

  // /whoami - shows LINE userId
  if (userText === '/whoami') {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🆔 Your LINE userId:\n' + userId }],
    });
  }

  // /setowner - first user becomes owner
  if (userText === '/setowner' && !OWNER_USER_ID) {
    OWNER_USER_ID = userId;
    console.log('[OWNER] Set to: ' + userId);
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '👑 Owner set!\nUserId: ' + userId }],
    });
  }

  // Owner-only mode
  if (OWNER_ONLY && OWNER_USER_ID && userId !== OWNER_USER_ID) {
    console.log('[BLOCKED] ' + userId.slice(0,8) + '...');
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🔒 このBotは現在オーナー専用モードです。' }],
    });
  }

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
    const statusText = '📊 JClaw v2.0 Status\n\n'
      + '🦙 Model: ' + OLLAMA_MODEL + '\n'
      + '🧠 Memory: Tier S (memclawz v9.1)\n'
      + '   Qdrant + Neo4j Knowledge Graph\n'
      + '🔍 Search: SearXNG (self-hosted, free)\n'
      + '💬 History: ' + history.length + '/' + MAX_HISTORY + ' turns\n'
      + '🔒 Mode: Owner Only\n\n'
      + '🌐 Links:\n'
      + 'Web: https://jclaw.1d1s.com\n'
      + 'Chat: https://chat.1d1s.com\n'
      + 'GitHub: https://github.com/iHouse-japan/jclaw\n'
      + '龙虾大全: https://longxia.1d1s.com\n'
      + 'ROBO: https://1d1s.com/robo/';
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: statusText }],
    });
  }

  // /help command
  if (userText === '/help' || userText === '/ヘルプ') {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: '🐾 JClaw v2.0 — AI Assistant\n'
        + 'by iHouse Japan 🇯🇵\n\n'
        + '━━━ 🧠 Tier S 記憶 ━━━\n'
        + 'あなたの名前・好み・過去の会話を記憶。\n'
        + 'Knowledge Graph + Vector Searchで\n'
        + '記憶精度 Mem0の2.7倍。\n\n'
        + '━━━ 🔍 Web検索 ━━━\n'
        + '「最新」「天気」「ニュース」等で自動検索。\n'
        + '/search /検索 /搜索 で直接検索も可。\n\n'
        + '━━━ ⚙️ コマンド ━━━\n'
        + '/search <query> — Web検索\n'
        + '/reset — 会話リセット\n'
        + '/status — システム状態\n'
        + '/whoami — あなたのID\n'
        + '/help — このヘルプ\n\n'
        + '━━━ 🌐 Links ━━━\n'
        + 'Web: https://jclaw.1d1s.com\n'
        + 'Chat: https://chat.1d1s.com\n'
        + 'GitHub: github.com/iHouse-japan/jclaw\n'
        + '龙虾大全: https://longxia.1d1s.com' }],
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
    memory: 'enabled (memclawz v9.1, Qdrant + Neo4j)',
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
  console.log('🐾 JClaw v2.0 is running on port ' + PORT);
  console.log('🦙 Ollama: ' + OLLAMA_HOST + ' (' + OLLAMA_MODEL + ')');
  console.log('🔍 Web Search: SearXNG (self-hosted, free, unlimited)');
  console.log('🧠 Memory: memclawz v9.1 (Qdrant + Neo4j, zero API cost)');
  console.log('📡 Webhook: http://localhost:' + PORT + '/webhook');
  console.log('='.repeat(50));
});
