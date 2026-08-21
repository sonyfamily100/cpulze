const chatgptPrompts = require('../prompts/chatgpt');
const geminiPrompts = require('../prompts/gemini');
const perplexityPrompts = require('../prompts/perplexity');

// The prompt modules now export buildPartA / buildPartB / buildPartC
// (self-contained "Complete" files) rather than a single buildRequest(part,...).
// This picks the right one based on which part is being run.
function dispatch(promptsModule, part, hotelName, location) {
  const fn = part === 'A' ? promptsModule.buildPartA
    : part === 'B' ? promptsModule.buildPartB
    : promptsModule.buildPartC;
  if (typeof fn !== 'function') {
    throw new Error(`Prompt module is missing buildPart${part} — check it matches the expected export shape.`);
  }
  return fn(hotelName, location);
}

function extractText(engine, json) {
  try {
    if (engine === 'chatgpt') {
      const msg = (json.output || []).find(o => o.type === 'message');
      return msg?.content?.[0]?.text || '';
    }
    if (engine === 'gemini') {
      return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }
    if (engine === 'perplexity') {
      return json.choices?.[0]?.message?.content || '';
    }
  } catch (e) { /* fall through */ }
  return '';
}

function extractGrounded(engine, json) {
  if (engine === 'chatgpt') {
    const hasSearchCall = (json.output || []).some(o => o.type === 'web_search_call');
    const numRequests = json.tool_usage?.web_search?.num_requests || 0;
    return hasSearchCall && numRequests > 0;
  }
  if (engine === 'gemini') {
    const gm = json.candidates?.[0]?.groundingMetadata;
    return !!(gm && gm.webSearchQueries && gm.webSearchQueries.length > 0);
  }
  if (engine === 'perplexity') {
    return Array.isArray(json.citations) && json.citations.length > 0;
  }
  return false;
}

function extractCitations(engine, json) {
  if (engine === 'chatgpt') {
    const urls = [];
    (json.output || []).forEach(o => (o.content || []).forEach(c =>
      (c.annotations || []).forEach(a => { if (a.url) urls.push(a.url); })));
    return urls;
  }
  if (engine === 'gemini') {
    const gm = json.candidates?.[0]?.groundingMetadata;
    return (gm?.groundingChunks || []).map(c => c.web?.uri).filter(Boolean);
  }
  if (engine === 'perplexity') {
    return json.citations || [];
  }
  return [];
}

async function callChatGPT(part, hotelName, location) {
  const body = dispatch(chatgptPrompts, part, hotelName, location);
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`ChatGPT ${part} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function callGemini(part, hotelName, location) {
  const body = dispatch(geminiPrompts, part, hotelName, location);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiPrompts.model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Gemini ${part} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function callPerplexity(part, hotelName, location) {
  const body = dispatch(perplexityPrompts, part, hotelName, location);
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Perplexity ${part} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const CALLERS = { chatgpt: callChatGPT, gemini: callGemini, perplexity: callPerplexity };

// Runs Part A, B, C sequentially for one engine and returns normalized results.
async function runEngine(engine, hotelName, location) {
  const caller = CALLERS[engine];
  if (!caller) throw new Error(`Unknown engine: ${engine}`);
  const parts = ['A', 'B', 'C'];
  const results = {};
  for (const part of parts) {
    const raw = await caller(part, hotelName, location);
    results[`part${part}`] = {
      engine, part,
      grounded: extractGrounded(engine, raw),
      citations: extractCitations(engine, raw),
      raw_text: extractText(engine, raw),
      raw_response: raw
    };
  }
  return results;
}

module.exports = { runEngine, extractText, extractGrounded, extractCitations };