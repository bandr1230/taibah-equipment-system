/*
  Source ownership signature.
  Owner: Bandar bin Khalaf Aljabri | بندر بن خلف الجابري
  Signature ID: BJ-TEIP-2026-SOURCE-SIGNATURE
  This marker is source-level only and is not rendered in UI or reports.
*/
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const LIVE_DATA_REFUSAL =
  'لا أستطيع عرض هذه المعلومة من خلال المساعد؛ لأنها تتطلب صلاحية تشغيلية وقراءة مباشرة من النظام.';

export const OUT_OF_SCOPE_REFUSAL =
  'اختصاصي هو برنامج إدارة التجهيزات والمخزون. لم أجد سياقًا كافيًا في وثائق البرنامج للإجابة عن هذا السؤال.';

export const NO_CONTEXT_REFUSAL =
  'لم أجد معلومة كافية في وثائق البرنامج المعتمدة للإجابة عن هذا السؤال.';

const DEFAULT_MODEL = 'assistant-mock';
const MAX_CONTEXT_CHARS = 4200;
const MAX_CHUNKS = 5;
const MIN_CONTEXT_SCORE = 3;

const DOC_SOURCES = [
  'docs/01_project_overview.md',
  'docs/02_permissions_model.md',
  'docs/03_inventory_logic.md',
  'docs/04_assets_and_public_links.md',
  'docs/05_need_evidence.md',
  'docs/06_supabase_and_data_flow.md',
  'docs/07_support_requests.md',
  'docs/08_reports_and_exports.md',
  'docs/10_decisions_log.md',
  'PERMISSIONS_MATRIX.md',
  'SUPPORT_WORKFLOW.md'
];

const JSON_CHUNK_SOURCES = [
  'knowledge_chunks/program_chunks.json'
];

const FORBIDDEN_SOURCE_PATTERNS = [
  /(^|\/|\\)09_codex_commands\.md$/i,
  /docs_cleanup_audit\.md$/i,
  /docs_forbidden_terms_scan\.md$/i,
  /cleanup/i,
  /scan/i,
  /_report\.md$/i,
  /_passed\.md$/i
];

const PROGRAM_TERMS = [
  'تجهيزات',
  'المخزون',
  'مخزون',
  'صنف',
  'الأصناف',
  'الصرف',
  'الإدخال',
  'احتياج',
  'الاحتياج',
  'الدعم',
  'طلبات الدعم',
  'قطاع',
  'قطاعات',
  'صلاحيات',
  'تقرير',
  'تقارير',
  'QR',
  'public-asset',
  'Supabase',
  'data.js',
  'app.js',
  'need-engine',
  'ai-analyzer',
  'جامعة طيبة',
  'منصة التجهيزات'
];

const OUT_OF_SCOPE_TERMS = [
  'قضية',
  'قضايا',
  'قانون',
  'قانونية',
  'ديوان',
  'مظالم',
  'بنك',
  'مصرف',
  'تداول',
  'أسهم',
  'ذهب',
  'فتوى',
  'صلاة',
  'سياسة',
  'طبخ',
  'سفر',
  'خارج نطاق البرنامج',
  'لا يخص البرنامج',
  'موضوع لا يخص'
];

const LIVE_DATA_PATTERNS = [
  /(?:كم|عدد|اعرض|اظهر|أظهر|اذكر|هات|ما هو|ماهي|ما هي)\s+(?:رصيد|كمية|كميات|أرصدة|ارصدة)/i,
  /(?:رصيد|كمية|كميات|أرصدة|ارصدة)\s+.+(?:الآن|حاليًا|حاليا|المتوفر|المتاحة|المتاح)/i,
  /(?:من\s+أي\s+قطاع|مصدر\s+الدعم|القطاع\s+المانح|من\s+وين|من\s+أين).*(?:الدعم|الصنف|توفير|تم)/i,
  /(?:أسماء|اسماء|قائمة|اعرض|اظهر|أظهر).*(?:المستخدمين|المستخدم|users|user)/i,
  /(?:كلمة\s+المرور|كلمات\s+المرور|password|token|api\s*key|service_role)/i,
  /(?:سجل\s+التدقيق|audit|logs|سجلات\s+حساسة)/i,
  /(?:قطاع\s+آخر|قطاع\s+اخر|قطاعات\s+أخرى|قطاعات\s+اخرى).*(?:رصيد|كمية|كميات|دعم|مصدر)/i
];

const ACTION_PATTERNS = [
  /(?:احذف|حذف|أضف|اضف|إضافة|اضافة|عدل|تعديل|اعتمد|ارفض|نفذ|نفّذ|اصرف|صرف|أغلق|اغلق|ارفع|سجل)\s+(?:صنف|مستخدم|طلب|دعم|رصيد|حركة|قطاع|بلاغ)/i
];

const ARABIC_STOP_WORDS = new Set([
  'ما',
  'ماذا',
  'من',
  'في',
  'على',
  'عن',
  'إلى',
  'الى',
  'كيف',
  'هل',
  'أي',
  'اي',
  'هذا',
  'هذه',
  'هو',
  'هي',
  'و',
  'أو',
  'او',
  'كل',
  'داخل',
  'عند',
  'مع',
  'ثم',
  'إذا',
  'اذا',
  'كان',
  'كانت',
  'لي',
  'عن'
]);

let cachedKnowledge = null;

export function normalizeArabicText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[إأآٱا]/g, 'ا')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}_%-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(text) {
  return normalizeArabicText(text)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length > 1)
    .filter(token => !ARABIC_STOP_WORDS.has(token));
}

function includesAny(text, terms) {
  const normalized = normalizeArabicText(text);
  return terms.some(term => normalized.includes(normalizeArabicText(term)));
}

function isForbiddenSource(sourceFile) {
  const value = String(sourceFile || '');
  return FORBIDDEN_SOURCE_PATTERNS.some(pattern => pattern.test(value));
}

function readTextFile(rootDir, relativePath) {
  const fullPath = path.resolve(rootDir, relativePath);
  const resolvedRoot = path.resolve(rootDir);
  if (!fullPath.startsWith(resolvedRoot)) return null;
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf8');
}

function stripMarkdownNoise(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, match => match.slice(0, 260))
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]+]\(([^)]+)\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitTextToChunks(sourceFile, text) {
  const cleaned = stripMarkdownNoise(text);
  const sections = cleaned
    .split(/(?=^#{1,3}\s+)/gm)
    .map(part => part.trim())
    .filter(Boolean);
  const rawParts = sections.length ? sections : cleaned.split(/\n\s*\n/g).filter(Boolean);
  const chunks = [];

  for (const part of rawParts) {
    const titleMatch = part.match(/^#{1,3}\s+(.+)$/m);
    const topic = titleMatch ? titleMatch[1].trim() : path.basename(sourceFile);
    if (part.length <= 1200) {
      chunks.push({ topic, content: part });
      continue;
    }

    for (let offset = 0; offset < part.length; offset += 950) {
      chunks.push({
        topic,
        content: part.slice(offset, offset + 1200).trim()
      });
    }
  }

  return chunks.map((chunk, index) => ({
    id: `DOC-${sourceFile.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
    source_file: sourceFile,
    topic: chunk.topic,
    content: chunk.content,
    keywords: [],
    priority: 'medium'
  }));
}

function loadJsonChunks(rootDir, relativePath) {
  const raw = readTextFile(rootDir, relativePath);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(chunk => !isForbiddenSource(chunk.source_file))
      .map(chunk => ({
        id: String(chunk.id || ''),
        source_file: String(chunk.source_file || relativePath),
        topic: String(chunk.topic || ''),
        content: String(chunk.content || ''),
        keywords: Array.isArray(chunk.keywords) ? chunk.keywords.map(String) : [],
        priority: chunk.priority || 'medium'
      }))
      .filter(chunk => chunk.id && chunk.content);
  } catch {
    return [];
  }
}

export function loadKnowledgeBase(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  if (!options.fresh && cachedKnowledge) return cachedKnowledge;

  const chunks = [];
  for (const source of JSON_CHUNK_SOURCES) {
    chunks.push(...loadJsonChunks(rootDir, source));
  }

  for (const source of DOC_SOURCES) {
    if (isForbiddenSource(source)) continue;
    const text = readTextFile(rootDir, source);
    if (!text) continue;
    chunks.push(...splitTextToChunks(source, text));
  }

  cachedKnowledge = chunks;
  return chunks;
}

export function isSensitiveOperationalQuestion(question) {
  const text = String(question || '');
  return LIVE_DATA_PATTERNS.some(pattern => pattern.test(text));
}

export function isUnsupportedActionQuestion(question) {
  const text = String(question || '');
  return ACTION_PATTERNS.some(pattern => pattern.test(text));
}

export function isOutOfScopeQuestion(question) {
  const text = String(question || '');
  if (includesAny(text, PROGRAM_TERMS)) return false;
  return includesAny(text, OUT_OF_SCOPE_TERMS);
}

function scoreChunk(question, chunk) {
  const normalizedQuestion = normalizeArabicText(question);
  const questionTokens = tokenize(question);
  const normalizedTopic = normalizeArabicText(chunk.topic);
  const normalizedContent = normalizeArabicText(chunk.content);
  const normalizedKeywords = (chunk.keywords || []).map(normalizeArabicText);
  let score = 0;

  for (const keyword of normalizedKeywords) {
    if (keyword && normalizedQuestion.includes(keyword)) score += 12;
  }

  for (const token of questionTokens) {
    if (normalizedKeywords.some(keyword => keyword === token || keyword.includes(token))) score += 5;
    if (normalizedTopic.includes(token)) score += 3;
    if (normalizedContent.includes(token)) score += 1;
  }

  if (normalizedTopic && normalizedQuestion.includes(normalizedTopic)) score += 8;
  if (chunk.priority === 'high') score += 0.75;
  if (chunk.priority === 'medium') score += 0.35;
  return score;
}

export function searchKnowledge(question, options = {}) {
  const chunks = loadKnowledgeBase(options);
  return chunks
    .map(chunk => ({ ...chunk, score: scoreChunk(question, chunk) }))
    .filter(chunk => chunk.score >= (options.minScore || MIN_CONTEXT_SCORE))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || MAX_CHUNKS);
}

function compactContexts(contexts) {
  let total = 0;
  const safe = [];
  for (const chunk of contexts) {
    const content = String(chunk.content || '').slice(0, 1300);
    if (total + content.length > MAX_CONTEXT_CHARS) break;
    total += content.length;
    safe.push({
      id: chunk.id,
      source_file: chunk.source_file,
      topic: chunk.topic,
      content,
      score: Number(chunk.score || 0)
    });
  }
  return safe;
}

function contextToAnswer(question, contexts) {
  const joined = contexts
    .map(chunk => chunk.content)
    .join('\n\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!joined) return NO_CONTEXT_REFUSAL;

  const normalizedQuestion = normalizeArabicText(question);
  const simpleQuestion =
    normalizedQuestion.includes('كيف اضيف صنف') ||
    normalizedQuestion.includes('اضافه صنف') ||
    normalizedQuestion.includes('اضافة صنف');

  if (simpleQuestion) {
    return [
      'لإضافة صنف داخل البرنامج، افتح صفحة الأصناف والمخزون ثم استخدم إجراء إضافة صنف، وأدخل بيانات التعريف الأساسية مثل القطاع والقسم والتصنيف والاسم ووحدة الرصيد والرصيد والحد الأدنى والمواصفات عند الحاجة.',
      'احرص على أن يكون الاسم الأساسي والمواصفة ووحدة الرصيد مطابقة لطريقة إدخال الصنف في المراجع التعليمية حتى تظهر الجاهزية والاحتياج بشكل صحيح.'
    ].join('\n');
  }

  const supportQuestion = normalizedQuestion.includes('دعم') || normalizedQuestion.includes('طلبات الدعم');
  if (supportQuestion) {
    return [
      'طلبات الدعم بين القطاعات تمر عبر إدارة التجهيزات: يرفع القطاع الطالب طلبًا لصنف وكمية ومبرر، ثم تراجع إدارة التجهيزات الطلب وتحدد مصدر الدعم عند وجود الصلاحية المناسبة.',
      'القطاع الطالب لا يرى القطاع المانح أو أرصدة القطاعات الأخرى، والقطاع المانح لا يرى المستفيد. التفاصيل الكاملة تظهر فقط للإدارة أو من يملك صلاحيات الدعم الإدارية.'
    ].join('\n');
  }

  const sentences = joined
    .split(/(?<=[.!؟])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 30);

  return sentences.slice(0, 5).join('\n') || joined.slice(0, 900);
}

function sourcesFromContexts(contexts) {
  return contexts.map(chunk => ({
    id: chunk.id,
    source_file: chunk.source_file,
    topic: chunk.topic,
    score: chunk.score
  }));
}

export function buildAssistantContext(question, options = {}) {
  if (!question || !String(question).trim()) {
    return {
      allowed: false,
      classification: 'empty',
      refusal: 'اكتب سؤالك أولًا حتى أستطيع مساعدتك.',
      contexts: [],
      sources: []
    };
  }

  if (isUnsupportedActionQuestion(question)) {
    return {
      allowed: false,
      classification: 'unsupported_action',
      refusal: 'هذا الطلب يتضمن إجراءً تشغيليًا أو تعديلًا على البيانات، وهو غير مدعوم من خلال المساعد.',
      contexts: [],
      sources: []
    };
  }

  if (isSensitiveOperationalQuestion(question)) {
    return {
      allowed: false,
      classification: 'sensitive_operational_data',
      refusal: LIVE_DATA_REFUSAL,
      contexts: [],
      sources: []
    };
  }

  if (isOutOfScopeQuestion(question)) {
    return {
      allowed: false,
      classification: 'out_of_scope',
      refusal: OUT_OF_SCOPE_REFUSAL,
      contexts: [],
      sources: []
    };
  }

  const contexts = compactContexts(searchKnowledge(question, options));
  if (!contexts.length) {
    return {
      allowed: false,
      classification: 'no_context',
      refusal: NO_CONTEXT_REFUSAL,
      contexts: [],
      sources: []
    };
  }

  return {
    allowed: true,
    classification: 'knowledge',
    refusal: '',
    contexts,
    sources: sourcesFromContexts(contexts)
  };
}

function redactSensitiveText(answer) {
  return String(answer || '')
    .replace(/password\s*[:=]\s*\S+/gi, 'password: [redacted]')
    .replace(/token\s*[:=]\s*\S+/gi, 'token: [redacted]')
    .replace(/api[_-]?key\s*[:=]\s*\S+/gi, 'apiKey: [redacted]')
    .replace(/service_role\s*[:=]\s*\S+/gi, 'service_role: [redacted]');
}

function guardAnswer(answer, context) {
  if (!context.allowed) return context.refusal;
  const clean = redactSensitiveText(answer).trim();
  return clean || 'لم أتمكن من توليد إجابة موثوقة من السياق المتاح.';
}

async function callMockProvider(question, context) {
  return {
    provider: 'mock',
    model: DEFAULT_MODEL,
    answer: contextToAnswer(question, context.contexts)
  };
}

async function callLocalProvider(question, context) {
  const localUrl = process.env.LOCAL_MODEL_URL || '';
  if (!localUrl) {
    return {
      provider: 'mock',
      model: DEFAULT_MODEL,
      answer: contextToAnswer(question, context.contexts),
      warning: 'LOCAL_MODEL_URL is not configured; mock provider was used.'
    };
  }

  const response = await fetch(localUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      context: {
        instruction: 'أجب بالعربية من سياق برنامج إدارة التجهيزات والمخزون فقط.',
        chunks: context.contexts
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Local model returned ${response.status}`);
  }

  const payload = await response.json();
  return {
    provider: 'local',
    model: process.env.ASSISTANT_MODEL || process.env.LLM_MODEL || 'local-model',
    answer: payload.answer || payload.text || ''
  };
}

async function callOpenAICompatibleProvider(question, context) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || '';
  const baseUrl = (process.env.OPENAI_COMPATIBLE_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.ASSISTANT_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return {
      provider: 'mock',
      model: DEFAULT_MODEL,
      answer: contextToAnswer(question, context.contexts),
      warning: 'OPENAI_API_KEY/LLM_API_KEY is not configured; mock provider was used.'
    };
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: [
            'أنت مساعد داخلي خاص ببرنامج إدارة التجهيزات والمخزون.',
            'أجب فقط من السياق المرفق.',
            'لا تخترع بيانات ولا تقرأ قاعدة بيانات حية.',
            'لا تصدر قرارات إدارية نهائية.',
            'إذا لم يكف السياق فقل ذلك بوضوح.'
          ].join('\n')
        },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            context: context.contexts
          })
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible provider returned ${response.status}`);
  }

  const payload = await response.json();
  return {
    provider: 'openai_compatible',
    model,
    answer: payload?.choices?.[0]?.message?.content || ''
  };
}

async function generateWithProvider(question, context) {
  const provider = (process.env.ASSISTANT_PROVIDER || 'mock').trim().toLowerCase();

  if (provider === 'mock') return callMockProvider(question, context);
  if (provider === 'local') return callLocalProvider(question, context);
  if (provider === 'openai_compatible') return callOpenAICompatibleProvider(question, context);

  return {
    provider: 'mock',
    model: DEFAULT_MODEL,
    answer: contextToAnswer(question, context.contexts),
    warning: `Unknown ASSISTANT_PROVIDER "${provider}"; mock provider was used.`
  };
}

export async function answerAssistantQuestion(question, options = {}) {
  const context = buildAssistantContext(question, options);
  if (!context.allowed) {
    return {
      ok: true,
      answer: context.refusal,
      provider: 'guard',
      model: null,
      classification: context.classification,
      sources: [],
      hasContext: false
    };
  }

  const generated = await generateWithProvider(question, context);
  const answer = guardAnswer(generated.answer, context);

  return {
    ok: true,
    answer,
    provider: generated.provider,
    model: generated.model,
    warning: generated.warning || '',
    classification: context.classification,
    sources: context.sources,
    hasContext: true
  };
}

export async function handleAssistantChatRequest(body, options = {}) {
  const question = String(body?.message || body?.question || '').trim();
  if (!question) {
    return {
      status: 400,
      body: {
        ok: false,
        answer: 'اكتب سؤالك أولًا حتى أستطيع مساعدتك.',
        sources: []
      }
    };
  }

  try {
    const result = await answerAssistantQuestion(question, options);
    return { status: 200, body: { question, ...result } };
  } catch (error) {
    return {
      status: 500,
      body: {
        ok: false,
        question,
        answer: 'تعذر تشغيل المساعد حاليًا. حاول مرة أخرى لاحقًا.',
        error: error instanceof Error ? error.message : String(error),
        sources: []
      }
    };
  }
}
