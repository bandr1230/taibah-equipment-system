import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type AnalysisType = "needs" | "inventory" | "maintenance" | "spending_efficiency" | "risk" | "executive";
type Row = Record<string, unknown>;

const ANALYSIS_TYPES = ["needs", "inventory", "maintenance", "spending_efficiency", "risk", "executive"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    analysis_type: { enum: ["maintenance", "inventory", "needs", "spending_efficiency", "risk", "executive"] },
    executive_summary: { type: "string" },
    overall_status: { enum: ["excellent", "good", "warning", "critical"] },
    risk_level: { enum: ["low", "medium", "high", "critical"] },
    confidence_score: { type: "number", minimum: 0, maximum: 1 },
    data_quality_notes: { type: "array", items: { type: "string" } },
    key_findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          evidence: { type: "string" },
          priority: { enum: ["low", "medium", "high", "critical"] },
          related_entity_type: { enum: ["item", "asset", "ticket", "sector", "request", "lab"] },
          related_entity_id: { type: "string" },
        },
        required: ["title", "description", "evidence", "priority", "related_entity_type", "related_entity_id"],
      },
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          recommendation_type: { enum: ["purchase", "redistribute", "maintenance", "replace", "reject", "approve", "review", "safety_action"] },
          priority: { enum: ["low", "medium", "high", "critical"] },
          expected_impact: { type: "string" },
          requires_approval: { type: "boolean" },
          related_entity_type: { enum: ["item", "asset", "ticket", "sector", "request", "lab"] },
          related_entity_id: { type: "string" },
        },
        required: ["title", "description", "recommendation_type", "priority", "expected_impact", "requires_approval", "related_entity_type", "related_entity_id"],
      },
    },
    suggested_actions: { type: "array", items: { type: "string" } },
    charts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          type: { enum: ["bar", "line", "pie", "table"] },
          data: { type: "array" },
        },
        required: ["title", "type", "data"],
      },
    },
    meta: {
      type: "object",
      additionalProperties: true,
      properties: {
        used_ai: { type: "boolean" },
        used_fallback: { type: "boolean" },
        message: { type: "string" },
        generated_at: { type: "string" },
        records_analyzed: {
          type: "object",
          additionalProperties: false,
          properties: {
            assets: { type: "number" },
            tickets: { type: "number" },
            plans: { type: "number" },
            items: { type: "number" },
            requests: { type: "number" },
            movements: { type: "number" },
          },
          required: ["assets", "tickets", "plans", "items", "requests", "movements"],
        },
      },
      required: ["used_ai", "used_fallback", "records_analyzed", "generated_at"],
    },
  },
  required: ["analysis_type", "executive_summary", "overall_status", "risk_level", "confidence_score", "data_quality_notes", "key_findings", "recommendations", "suggested_actions", "charts", "meta"],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function uuidOrNull(value: unknown) {
  const raw = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

function dateOnly(value: unknown) {
  const raw = text(value);
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw.slice(0, 10);
}

function serviceHeaders(extra: Record<string, string> = {}) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function supabaseRestUrl(path: string) {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("Missing SUPABASE_URL");
  return `${url.replace(/\/$/, "")}/rest/v1/${path}`;
}

async function restGet(table: string, query = "select=*&limit=1000") {
  try {
    const res = await fetch(supabaseRestUrl(`${table}?${query}`), { headers: serviceHeaders() });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function loadAppState() {
  const stateId = Deno.env.get("SUPABASE_APP_STATE_ID") || "taibah-university-demo";
  const rows = await restGet("app_state", `id=eq.${encodeURIComponent(stateId)}&select=data&limit=1`);
  return (rows[0]?.data && typeof rows[0].data === "object" ? rows[0].data : {}) as Row;
}

function mergeRows(...groups: Row[][]) {
  const map = new Map<string, Row>();
  groups.flat().forEach((row, index) => {
    const key = text(row.id || row.asset_id || row.ticket_number || row.request_no || row.code || `row-${index}`);
    if (!map.has(key)) map.set(key, row);
  });
  return [...map.values()];
}

async function loadSourceData() {
  const app = await loadAppState();
  const [
    maintenanceAssets,
    assets,
    tickets,
    plans,
    records,
    items,
    inventory,
    issueRequests,
    needsRequests,
    stockMovements,
    transactions,
  ] = await Promise.all([
    restGet("maintenance_assets"),
    restGet("assets"),
    restGet("maintenance_tickets"),
    restGet("preventive_maintenance_plans"),
    restGet("preventive_maintenance_records"),
    restGet("items"),
    restGet("inventory"),
    restGet("issue_requests"),
    restGet("needs_requests"),
    restGet("stock_movements"),
    restGet("transactions"),
  ]);
  return {
    users: app.users as Row[] || [],
    items: mergeRows(app.items as Row[] || [], items, inventory),
    transactions: mergeRows(app.transactions as Row[] || [], stockMovements, transactions),
    needsRequests: mergeRows(app.needsRequests as Row[] || [], issueRequests, needsRequests),
    needEvidence: app.needEvidence as Row[] || [],
    maintenanceAssets: mergeRows(app.maintenanceAssets as Row[] || [], maintenanceAssets, assets),
    maintenanceTickets: mergeRows(app.maintenanceTickets as Row[] || [], tickets),
    preventiveMaintenancePlans: mergeRows(app.preventiveMaintenancePlans as Row[] || [], plans),
    preventiveMaintenanceRecords: mergeRows(app.preventiveMaintenanceRecords as Row[] || [], records),
    fieldVisits: app.fieldVisits as Row[] || [],
    sparePartRequests: app.sparePartRequests as Row[] || [],
  };
}

function hasPermission(user: Row | undefined, permission: string) {
  if (!user) return false;
  if (text(user.role).toLowerCase() === "admin") return true;
  const permissions = Array.isArray(user.permissions) ? user.permissions.map(text) : [];
  return permissions.includes("all") || permissions.includes(permission);
}

function resolveScope(data: Row, input: Row) {
  const users = data.users as Row[] || [];
  const requestedBy = text(input.requested_by || input.user_id || input.current_user_id);
  const user = users.find((row) => text(row.id) === requestedBy);
  const role = text(user?.role).toLowerCase();
  const college = text(user?.college);
  const requestedSector = text(input.sector_id || input.sector || "all") || "all";
  const isCentral = role === "admin" || hasPermission(user, "manage_users") || hasPermission(user, "report_senior") || /equipment|إدارة التجهيزات|التجهيزات/i.test(college);
  if (isCentral) return { user, sector: requestedSector, isCentral, requestedBy };
  if (college) return { user, sector: college, isCentral: false, requestedBy };
  return { user, sector: "__no_authorized_sector__", isCentral: false, requestedBy };
}

function rowSector(row: Row) {
  return [row.college, row.sector_id, row.sectorId, row.sector, row.fromCollege, row.toCollege].map(text).filter(Boolean);
}

function inSector(row: Row, sector: string) {
  if (!sector || sector === "all") return true;
  return rowSector(row).some((value) => value === sector);
}

function inDate(row: Row, fields: string[], from = "", to = "") {
  if (!from && !to) return true;
  const dates = fields.map((field) => dateOnly(row[field])).filter(Boolean);
  if (!dates.length) return false;
  return dates.some((date) => (!from || date >= from) && (!to || date <= to));
}

function searchMatch(row: Row, query: string) {
  if (!query) return true;
  return JSON.stringify(row).toLowerCase().includes(query.toLowerCase());
}

function scoped(rows: Row[] = [], sector: string, from: string, to: string, query: string, fields: string[]) {
  return rows.filter((row) => inSector(row, sector)).filter((row) => inDate(row, fields, from, to)).filter((row) => searchMatch(row, query));
}

function groupBy(rows: Row[], keyFn: (row: Row) => string, qtyFn: (row: Row) => number = (row) => Number(row.qty || row.quantity || 0)) {
  const map = new Map<string, { key: string; rows: Row[]; qty: number; count: number }>();
  rows.forEach((row) => {
    const key = keyFn(row) || "غير محدد";
    if (!map.has(key)) map.set(key, { key, rows: [], qty: 0, count: 0 });
    const bucket = map.get(key)!;
    bucket.rows.push(row);
    bucket.qty += qtyFn(row);
    bucket.count += 1;
  });
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.count - a.count);
}

function summarize(data: Row, input: Row, scope: ReturnType<typeof resolveScope>) {
  const sector = scope.sector;
  const from = dateOnly(input.date_from);
  const to = dateOnly(input.date_to);
  const filters = input.filters && typeof input.filters === "object" ? input.filters as Row : {};
  const query = text(input.search_query || input.entity_query || filters.search_query || filters.entity_query);
  const entityId = text(input.entity_id);
  const items = scoped(data.items as Row[] || [], sector, from, to, query, ["createdAt", "updatedAt", "lastEditedAt", "created_at", "updated_at"]);
  const needs = scoped(data.needsRequests as Row[] || [], sector, from, to, query, ["createdAt", "reviewedAt", "updatedAt", "created_at", "updated_at"]);
  const transactions = scoped(data.transactions as Row[] || [], sector, from, to, query, ["transactionAt", "createdAt", "updatedAt", "movement_date", "created_at"]);
  const assets = scoped(data.maintenanceAssets as Row[] || [], sector, from, to, query, ["createdAt", "updatedAt", "lastMaintenanceDate", "nextMaintenanceDate", "created_at", "updated_at"]);
  const tickets = scoped(data.maintenanceTickets as Row[] || [], sector, from, to, query, ["reportedAt", "failureDate", "closedAt", "createdAt", "reported_at", "closed_at"]);
  const plans = scoped(data.preventiveMaintenancePlans as Row[] || [], sector, from, to, query, ["lastMaintenanceDate", "nextDueDate", "createdAt", "next_due_date", "created_at"]);
  const records = scoped(data.preventiveMaintenanceRecords as Row[] || [], sector, from, to, query, ["maintenanceDate", "maintenance_date", "createdAt", "created_at"]);
  const filteredAssets = entityId ? assets.filter((row) => text(row.id || row.asset_id) === entityId) : assets;
  const lowStock = items.filter((item) => Number(item.qty || item.quantity || 0) <= Number(item.minQty || item.min_qty || 0));
  const stoppedAssets = filteredAssets.filter((asset) => /متوقف|خارج|stopped|down|out/i.test(text(asset.status)));
  const overduePlans = plans.filter((plan) => {
    const due = dateOnly(plan.nextDueDate || plan.next_due_date);
    return due && due < new Date().toISOString().slice(0, 10) && !/مكتمل|completed/i.test(text(plan.status));
  });
  return {
    scope: { sector, date_from: from, date_to: to, search_query: query, entity_id: entityId },
    records_analyzed: {
      assets: filteredAssets.length,
      tickets: tickets.length,
      plans: plans.length,
      items: items.length,
      requests: needs.length,
      movements: transactions.length,
    },
    counts: {
      records: records.length,
      low_stock: lowStock.length,
      stopped_assets: stoppedAssets.length,
      overdue_plans: overduePlans.length,
      open_tickets: tickets.filter((ticket) => !/مغلق|closed/i.test(text(ticket.status))).length,
      critical_tickets: tickets.filter((ticket) => /حرج|critical/i.test(text(ticket.priority || ticket.urgency))).length,
    },
    samples: {
      low_stock: lowStock.slice(0, 12),
      needs: needs.slice(0, 12),
      assets: filteredAssets.slice(0, 12),
      stopped_assets: stoppedAssets.slice(0, 12),
      overdue_plans: overduePlans.slice(0, 12),
      tickets: tickets.slice(0, 12),
      records: records.slice(0, 12),
      top_need_items: groupBy(needs, (row) => text(row.itemNameAr || row.item_name_ar || row.itemNameEn || row.item_name_en), (row) => Number(row.qty || row.quantity || row.final_qty || 0)).slice(0, 8),
      top_ticket_assets: groupBy(tickets, (row) => text(row.assetNameAr || row.asset_name_ar || row.serialNumber || row.serial_number || row.assetId || row.asset_id), () => 1).slice(0, 8),
    },
  };
}

function finding(title: string, description: string, evidence: string, priority = "medium", related_entity_type = "sector", related_entity_id = "") {
  return { title, description, evidence, priority, related_entity_type, related_entity_id: text(related_entity_id) };
}

function recommendation(title: string, description: string, recommendation_type = "review", priority = "medium", expected_impact = "تحسين جودة القرار وتقليل الهدر.", related_entity_type = "sector", related_entity_id = "") {
  return { title, description, recommendation_type, priority, expected_impact, requires_approval: true, related_entity_type, related_entity_id: text(related_entity_id) };
}

function fallbackResult(type: AnalysisType, summary: Row, message: string) {
  const records = summary.records_analyzed as Row;
  const counts = summary.counts as Row;
  const total = Object.values(records).reduce((sum, value) => sum + Number(value || 0), 0);
  const risk = Number(counts.stopped_assets || 0) || Number(counts.overdue_plans || 0) || Number(counts.critical_tickets || 0) ? "high" : Number(counts.low_stock || 0) ? "medium" : "low";
  const findings = [
    finding("ملخص السجلات المحللة", `تم تحليل ${records.assets || 0} أصل، ${records.tickets || 0} بلاغ، ${records.plans || 0} خطة، ${records.items || 0} صنف.`, "إجمالي السجلات المتاحة ضمن النطاق والصلاحية.", total ? "medium" : "low", "sector", text((summary.scope as Row).sector)),
  ];
  const recommendations = [
    recommendation("مراجعة التوصيات يدويًا", "هذه قراءة مساعدة ولا تنفذ أي إجراء تلقائيًا. يلزم اعتماد المسؤول المختص قبل أي قرار.", "review", "medium", "تعزيز الحوكمة ومنع القرارات الآلية.", "sector", text((summary.scope as Row).sector)),
  ];
  if (type === "maintenance") {
    if (!Number(records.plans || 0)) {
      findings.push(finding("لا توجد خطط صيانة وقائية مسجلة", "لا تظهر خطط صيانة وقائية ضمن النطاق الحالي.", "عدد خطط الصيانة الوقائية في النطاق يساوي صفر.", "medium", "asset", ""));
      recommendations.push(recommendation("إنشاء خطط صيانة للأجهزة عالية الخطورة", "ابدأ بالأجهزة عالية الخطورة ثم الأجهزة كثيرة الأعطال.", "maintenance", "high", "رفع جاهزية الأجهزة وتقليل توقف المعامل.", "asset", ""));
    }
    if (Number(records.tickets || 0) < 3) {
      recommendations.push(recommendation("تجميع بيانات أعطال لمدة شهر", "عدد البلاغات قليل ولا يكفي لاستنتاج نمط أعطال موثوق.", "review", "medium", "تحسين دقة التحليل المستقبلي.", "ticket", ""));
    }
  }
  if (Number(counts.low_stock || 0)) {
    findings.push(finding("أصناف تحت الحد الأدنى", `يوجد ${counts.low_stock} أصناف تحت الحد الأدنى.`, "مقارنة الرصيد الحالي بالحد الأدنى.", "high", "item", ""));
    recommendations.push(recommendation("معالجة الأصناف تحت الحد", "راجع إمكانية الشراء أو إعادة التوزيع قبل رفع احتياج جديد.", "purchase", "high", "تقليل تعطل التجارب والحد من الشراء غير الضروري.", "item", ""));
  }
  if (Number(counts.overdue_plans || 0)) {
    findings.push(finding("صيانة وقائية متأخرة", `يوجد ${counts.overdue_plans} خطط صيانة متأخرة.`, "مقارنة تاريخ الاستحقاق بتاريخ اليوم.", "high", "asset", ""));
    recommendations.push(recommendation("جدولة الصيانة المتأخرة", "أعد ترتيب جدول الزيارات للأجهزة المتأخرة، خاصة عالية الخطورة.", "maintenance", "high", "خفض مخاطر التوقف والسلامة.", "asset", ""));
  }
  const dataQualityNotes = total ? [] : ["البيانات قليلة في النطاق الحالي؛ التوصيات تشغيلية أولية وليست استنتاجًا نهائيًا."];
  if (total < 5) dataQualityNotes.push("أضف بيانات تشغيل وصيانة لمدة شهر على الأقل للحصول على تحليل أدق.");
  return {
    analysis_type: type,
    executive_summary: `تم تحليل البيانات المتاحة ضمن الصلاحيات. مستوى المخاطر الحالي: ${risk}.`,
    overall_status: risk === "high" ? "warning" : "good",
    risk_level: risk,
    confidence_score: total ? 0.62 : 0.38,
    data_quality_notes: dataQualityNotes,
    key_findings: findings,
    recommendations,
    suggested_actions: ["مراجعة البيانات الناقصة.", "ربط الأجهزة بخطط صيانة وقائية.", "اعتماد أو رفض التوصيات من مستخدم مخول فقط."],
    charts: [{ title: "السجلات المحللة", type: "table", data: Object.entries(records).map(([label, value]) => ({ label, value })) }],
    meta: {
      used_ai: false,
      used_fallback: true,
      message,
      records_analyzed: records,
      generated_at: new Date().toISOString(),
    },
  };
}

function normalizeResult(raw: Row, type: AnalysisType, summary: Row, meta: Row) {
  const fallback = fallbackResult(type, summary, text(meta.message || "تم استخدام التحليل المحلي."));
  const result = raw && typeof raw === "object" ? raw : fallback;
  const records = summary.records_analyzed as Row;
  return {
    analysis_type: ANALYSIS_TYPES.includes(text(result.analysis_type)) ? result.analysis_type : type,
    executive_summary: text(result.executive_summary) || fallback.executive_summary,
    overall_status: ["excellent", "good", "warning", "critical"].includes(text(result.overall_status)) ? result.overall_status : fallback.overall_status,
    risk_level: ["low", "medium", "high", "critical"].includes(text(result.risk_level)) ? result.risk_level : fallback.risk_level,
    confidence_score: Math.max(0, Math.min(1, Number(result.confidence_score ?? fallback.confidence_score))),
    data_quality_notes: Array.isArray(result.data_quality_notes) ? result.data_quality_notes.map(text).filter(Boolean) : fallback.data_quality_notes,
    key_findings: Array.isArray(result.key_findings) && result.key_findings.length ? result.key_findings : fallback.key_findings,
    recommendations: Array.isArray(result.recommendations) && result.recommendations.length ? result.recommendations : fallback.recommendations,
    suggested_actions: Array.isArray(result.suggested_actions) && result.suggested_actions.length ? result.suggested_actions : fallback.suggested_actions,
    charts: Array.isArray(result.charts) && result.charts.length ? result.charts : fallback.charts,
    meta: {
      used_ai: Boolean(meta.used_ai),
      used_fallback: Boolean(meta.used_fallback),
      message: text(meta.message),
      records_analyzed: records,
      generated_at: new Date().toISOString(),
    },
  };
}

async function askModel(type: AnalysisType, summary: Row) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return fallbackResult(type, summary, "تم استخدام التحليل المحلي لأن مفتاح الذكاء الاصطناعي غير مضبوط.");
  }
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: "أنت محلل حوكمة للتجهيزات التعليمية. أعد JSON فقط مطابقًا للمخطط. لا تقترح تنفيذًا تلقائيًا لأي إجراء، وكل توصية تحتاج اعتمادًا يدويًا." },
          { role: "user", content: JSON.stringify({ analysis_type: type, input_summary: summary }) },
        ],
        text: { format: { type: "json_schema", name: "ai_analyzer_result", schema: RESULT_SCHEMA, strict: true } },
      }),
    });
    if (!res.ok) {
      return fallbackResult(type, summary, "تم استخدام التحليل المحلي لأن الاتصال بنموذج الذكاء الاصطناعي تعذر.");
    }
    const data = await res.json();
    const output = Array.isArray(data.output) ? data.output : [];
    const content = data.output_text || output
      .flatMap((item: Row) => Array.isArray(item.content) ? item.content : [])
      .map((part: Row) => part.text || "")
      .join("") || "";
    const parsed = JSON.parse(content);
    return normalizeResult(parsed, type, summary, { used_ai: true, used_fallback: false, message: "تم تشغيل التحليل الذكي بنجاح." });
  } catch {
    return fallbackResult(type, summary, "تم استخدام التحليل المحلي لأن الاتصال بنموذج الذكاء الاصطناعي تعذر.");
  }
}

async function persistAnalysis(input: Row, summary: Row, result: Row, scope: ReturnType<typeof resolveScope>) {
  const resultMeta = result.meta && typeof result.meta === "object" ? result.meta as Row : {};
  const runPayload = {
    analysis_type: result.analysis_type,
    sector_id: text(input.sector_id || (summary.scope as Row).sector) || null,
    date_from: dateOnly(input.date_from) || null,
    date_to: dateOnly(input.date_to) || null,
    requested_by: uuidOrNull(scope.requestedBy),
    input_summary: summary,
    ai_result_json: result,
    status: "completed",
    confidence_score: result.confidence_score ?? null,
    notes: text(resultMeta.message || "created by ai-analyzer edge function"),
  };
  const runRes = await fetch(supabaseRestUrl("ai_analysis_runs"), {
    method: "POST",
    headers: serviceHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify(runPayload),
  });
  if (!runRes.ok) return null;
  const runRows = await runRes.json();
  const run = runRows?.[0];
  const recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
  let recommendationRows: Row[] = [];
  if (run?.id && recommendations.length) {
    const recRes = await fetch(supabaseRestUrl("ai_recommendations"), {
      method: "POST",
      headers: serviceHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify(recommendations.map((rec: Row) => ({
        analysis_run_id: run.id,
        recommendation_type: rec.recommendation_type || "review",
        title: rec.title || "توصية",
        description: rec.description || "",
        priority: rec.priority || "medium",
        risk_level: rec.priority || result.risk_level || "medium",
        expected_impact: rec.expected_impact || "",
        related_entity_type: rec.related_entity_type || "sector",
        related_entity_id: text(rec.related_entity_id),
        status: "pending",
      }))),
    });
    if (recRes.ok) recommendationRows = await recRes.json();
  }
  return { run, recommendations: recommendationRows };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const input = await req.json().catch(() => ({}));
    const type = text(input.analysis_type || "executive") as AnalysisType;
    if (!ANALYSIS_TYPES.includes(type)) return json({ error: "Invalid analysis_type" }, 400);
    const data = await loadSourceData();
    const scope = resolveScope(data, input);
    const summary = summarize(data, input, scope);
    const result = await askModel(type, summary);
    const resultMeta = result.meta && typeof result.meta === "object" ? result.meta as Row : {};
    const finalResult = normalizeResult(result as Row, type, summary, {
      used_ai: resultMeta.used_ai,
      used_fallback: resultMeta.used_fallback,
      message: resultMeta.message || (resultMeta.used_ai ? "تم تشغيل التحليل الذكي بنجاح." : "تم استخدام التحليل المحلي لأن مفتاح الذكاء الاصطناعي غير مضبوط."),
    });
    const persisted = await persistAnalysis(input, summary, finalResult, scope).catch(() => null);
    (finalResult.meta as Row).persisted_run = persisted;
    return json(finalResult);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
