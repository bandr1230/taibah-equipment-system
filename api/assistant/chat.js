/*
  Source ownership signature.
  Owner: Bandar bin Khalaf Aljabri | بندر بن خلف الجابري
  Signature ID: BJ-TEIP-2026-SOURCE-SIGNATURE
  This marker is source-level only and is not rendered in UI or reports.
*/
import { handleAssistantChatRequest } from '../../assistant_core.mjs';

function readRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 64_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({
      ok: false,
      answer: 'هذا المسار يقبل طلبات POST فقط.',
      sources: []
    }));
    return;
  }

  const body = await readRequestBody(req);
  const result = await handleAssistantChatRequest(body, { rootDir: process.cwd() });
  res.statusCode = result.status;
  res.end(JSON.stringify(result.body));
}

