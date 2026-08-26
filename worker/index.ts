/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Fetcher { fetch(request: Request): Promise<Response>; }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}
interface D1Database { prepare(query: string): D1PreparedStatement; }

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENAI_API_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type DataCollection = "tasks" | "routines" | "schedule" | "goals" | "habits" | "workouts" | "trainingPlans" | "exercises" | "exerciseLogs" | "activityLogs" | "mealThemes" | "mealPlans" | "mealRecipes" | "nutritionGuides" | "purchaseItems" | "applications" | "notes" | "references";

type SyncRow = {
  payload_json: string;
  revision: number;
  updated_at: string;
};

const DATA_COLLECTIONS: DataCollection[] = ["tasks", "routines", "schedule", "goals", "habits", "workouts", "trainingPlans", "exercises", "exerciseLogs", "activityLogs", "mealThemes", "mealPlans", "mealRecipes", "nutritionGuides", "purchaseItems", "applications", "notes", "references"];
const MUTATION_PATTERN = /(加入|添加|新增|创建|修改|更新|改成|移动|拖到|完成|删除|移除|取消|重排|调整|安排|记一下|记到|记录一下|记录这|记录该|记录到|保存|提醒我|放到|放进|标记|延期|推迟)|\b(add|create|update|edit|move|complete|delete|remove|reorder|schedule|save|mark|remind)\b/i;
const REFERENCE_CONTEXT_PATTERN = /(私人速记|私人资料|常用网址|学校信息|参考资料|个人资料|备忘录|personal reference|quick reference)/i;
const REFERENCE_LOOKUP_PATTERN = /(?:(?:我的|本人|查找|找到|告诉我|能不能拿到|what(?:'s| is) my)[^。！？\n]{0,24}(?:手机(?:号|号码)?|电话号码|phone\s*(?:number)?|地址|address|邮箱|email|学号|student\s*(?:number|id)|房间号|room\s*number|SIN|SSN|API\s*key|密码|password|账号|账户|confirmation\s*number|token|常用命令|网址)|(?:手机(?:号|号码)?|电话号码|phone\s*(?:number)?|地址|address|邮箱|email|学号|student\s*(?:number|id)|房间号|room\s*number|SIN|SSN|API\s*key|密码|password|账号|账户|confirmation\s*number|token|常用命令|网址)[^。！？\n]{0,12}(?:多少|是什么|在哪|有没有|找出来|告诉我|给我|\?|？))/i;
const REFERENCE_CONTINUE_PATTERN = /(不需要管敏感|不用管敏感|继续整理|继续保存|照做|不要拒绝|不用脱敏|可以保存|保留原文)/i;
const COLLECTION_PATTERNS: Array<[DataCollection, RegExp]> = [
  ["applications", /(求职看板|求职记录|岗位|职位|公司|投递|面试|offer|application|job|role|position|company)/i],
  ["mealPlans", /((?:安排|计划|替换|更换|调整)[^。！？\n]{0,24}(?:早餐|午餐|晚餐|加餐|吃什么|饮食|伙食|菜单)|下周[^。！？\n]{0,16}(?:早餐|午餐|晚餐|饮食|伙食|菜单)|本周[^。！？\n]{0,16}(?:早餐|午餐|晚餐|饮食|伙食|菜单)|meal\s*plan|weekly\s*menu)/i],
  ["mealRecipes", /(菜谱|食谱|做法|烹饪步骤|需要什么材料|recipe|ingredients?)/i],
  ["mealThemes", /(饮食主题|早餐主题|正餐主题|主题库|选餐主题|meal\s*themes?)/i],
  ["nutritionGuides", /(饮食理念|健康观|饮食规则|营养规则|早餐公式|餐盘公式|nutrition\s*(?:guide|rule|philosophy))/i],
  ["purchaseItems", /(购物清单|购物事项|要买的东西|下次出门.*买|计划购买|考虑中|shopping\s*list|purchase\s*item)/i],
  ["exerciseLogs", /(力量记录|训练记录|重量记录|训练历史|工作重量历史|RIR|几组|每组|(?:今天|昨天|前天|\d{4}-\d{2}-\d{2})?[^。！？\n]{0,20}(?:练了|做了)[^。！？\n]{0,24}(?:lb|kg|磅|公斤|组|次)|exercise\s*log|strength\s*log|weight\s*history)/i],
  ["activityLogs", /(运动打卡|活动记录|实际运动|实际活动|散步记录|跑步记录|篮球记录|徒步记录|游泳记录|骑车记录|散步|快走|跑步|篮球|徒步|hiking|hike|骑车|游泳|拉伸|activity\s*log|运动记录)/i],
  ["exercises", /(动作库|动作要点|技术要点|我会的动作|掌握动作|当前工作重量|exercise\s*library|exercise\s*technique)/i],
  ["trainingPlans", /(训练计划|每周训练|力量\s*[ABCＡＢＣ]|稳态有氧|训练安排|健身安排|健身计划|锻炼计划|training\s*plan|workout\s*plan)/i],
  ["routines", /(固定任务|重复任务|每日任务|每天|隔天|每隔|每\s*\d+\s*天|recurring|routine|every day)/i],
  ["tasks", /(任务|待办|提醒|截止日期|deadline|todo|task)/i],
  ["schedule", /(课表|课程|固定安排|上课时间|tutorial|class schedule|course schedule|TA\b)/i],
  ["goals", /(目标|优先级|goal)/i],
  ["habits", /(水果|蔬菜|蛋白质|饮水|饮食习惯|nutrition|habit)/i],
  ["workouts", /(旧版运动|legacy workout)/i],
  ["notes", /(草稿箱|草稿|笔记|灵感|想法|backlog|draft|notes?)/i],
  ["references", REFERENCE_CONTEXT_PATTERN],
];

const SYNC_ARRAY_KEYS = ["tasks", "routines", "schedule", "goals", "habits", "workouts", "applications", "notes"] as const;
const OPTIONAL_SYNC_ARRAY_KEYS = ["trainingPlans", "exercises", "exerciseLogs", "activityLogs", "mealThemes", "mealPlans", "mealRecipes", "nutritionGuides", "purchaseItems"] as const;

function isCloudReference(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return typeof reference.id === "string"
    && typeof reference.title === "string"
    && typeof reference.content === "string"
    && typeof reference.pinned === "boolean"
    && reference.aiExcluded === false
    && typeof reference.createdAt === "string"
    && typeof reference.updatedAt === "string";
}

function syncResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authenticatedUserId(request: Request) {
  return request.headers.get("oai-authenticated-user-id")?.trim() || "";
}

function isValidSyncPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  if (!payload.phase || typeof payload.phase !== "object") return false;
  if (typeof payload.habitDate !== "string" || typeof payload.workoutWeek !== "string") return false;
  if (!SYNC_ARRAY_KEYS.every((key) => Array.isArray(payload[key]))) return false;
  if (!OPTIONAL_SYNC_ARRAY_KEYS.every((key) => !(key in payload) || Array.isArray(payload[key]))) return false;
  if ("uiPreferences" in payload) {
    const preferences = payload.uiPreferences;
    if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) return false;
    const record = preferences as Record<string, unknown>;
    if (!Array.isArray(record.navigationOrder) || !Array.isArray(record.semesterWeekOrder)) return false;
  }
  // Missing references is accepted for payloads written by older MAP builds.
  // When present, every record must carry an explicit opt-in marker. This
  // prevents a buggy client from uploading device-only notes by accident.
  return !("references" in payload) || (Array.isArray(payload.references) && payload.references.every(isCloudReference));
}

function normalizeSyncPayload(payload: Record<string, unknown>) {
  // Keep missing optional collections absent on legacy rows. The client can
  // then distinguish "not introduced yet" from an intentional empty library,
  // hydrate the new defaults once, and sync them back on its next write.
  return { ...payload, references: Array.isArray(payload.references) ? payload.references : [] };
}

function parseSyncRow(row: SyncRow) {
  const data = JSON.parse(row.payload_json) as unknown;
  if (!isValidSyncPayload(data)) throw new Error("Stored sync payload is invalid");
  return { initialized: true, data: normalizeSyncPayload(data), revision: row.revision, updatedAt: row.updated_at };
}

async function handleSync(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return syncResponse({ error: "云同步数据库尚未连接，本机离线数据仍可正常使用。" }, 503);
  const userId = authenticatedUserId(request);
  if (!userId) return syncResponse({ error: "请从已登录的 MAP 站点使用云同步。" }, 401);

  if (request.method === "GET") {
    try {
      const row = await env.DB.prepare("SELECT payload_json, revision, updated_at FROM map_user_state WHERE user_id = ?")
        .bind(userId)
        .first<SyncRow>();
      return row ? syncResponse(parseSyncRow(row)) : syncResponse({ initialized: false, revision: 0, data: null, updatedAt: null });
    } catch {
      return syncResponse({ error: "暂时无法读取云端计划，本机数据不会丢失。" }, 500);
    }
  }

  if (request.method !== "PUT") return syncResponse({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await request.text();
    if (rawBody.length > 900_000) return syncResponse({ error: "计划数据过大，无法同步。" }, 413);
    const body = JSON.parse(rawBody) as { baseRevision?: unknown; data?: unknown };
    const baseRevision = Number(body.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 0 || !isValidSyncPayload(body.data)) {
      return syncResponse({ error: "同步数据格式无效。" }, 400);
    }

    const current = await env.DB.prepare("SELECT payload_json, revision, updated_at FROM map_user_state WHERE user_id = ?")
      .bind(userId)
      .first<SyncRow>();
    const currentRevision = current?.revision || 0;
    if (currentRevision !== baseRevision) {
      return syncResponse({ error: "云端计划已经更新。", ...(current ? parseSyncRow(current) : { initialized: false, revision: 0, data: null, updatedAt: null }) }, 409);
    }

    const updatedAt = new Date().toISOString();
    const normalizedData = normalizeSyncPayload(body.data);
    const payloadJson = JSON.stringify(normalizedData);
    if (!current) {
      await env.DB.prepare("INSERT INTO map_user_state (user_id, payload_json, revision, updated_at) VALUES (?, ?, 1, ?)")
        .bind(userId, payloadJson, updatedAt)
        .run();
      return syncResponse({ initialized: true, data: normalizedData, revision: 1, updatedAt });
    }

    const nextRevision = currentRevision + 1;
    const result = await env.DB.prepare("UPDATE map_user_state SET payload_json = ?, revision = ?, updated_at = ? WHERE user_id = ? AND revision = ?")
      .bind(payloadJson, nextRevision, updatedAt, userId, currentRevision)
      .run();
    if ((result.meta?.changes || 0) === 0) {
      const latest = await env.DB.prepare("SELECT payload_json, revision, updated_at FROM map_user_state WHERE user_id = ?")
        .bind(userId)
        .first<SyncRow>();
      return syncResponse({ error: "云端计划已经更新。", ...(latest ? parseSyncRow(latest) : { initialized: false, revision: 0, data: null, updatedAt: null }) }, 409);
    }
    return syncResponse({ initialized: true, data: normalizedData, revision: nextRevision, updatedAt });
  } catch {
    return syncResponse({ error: "暂时无法写入云端，本机改动已保留，联网后会重试。" }, 500);
  }
}

function detectFocusedMutation(latestMessage: string, priorContext: string): DataCollection | null {
  if (!MUTATION_PATTERN.test(latestMessage)) return null;
  const directMatches = COLLECTION_PATTERNS.filter(([, pattern]) => pattern.test(latestMessage)).map(([collection]) => collection);
  if (directMatches.includes("references")) return "references";
  if (directMatches.includes("routines")) return "routines";
  if (directMatches.length === 1) return directMatches[0];
  if (directMatches.length > 1) return null;
  const contextMatches = COLLECTION_PATTERNS.filter(([, pattern]) => pattern.test(priorContext)).map(([collection]) => collection);
  return contextMatches.length === 1 ? contextMatches[0] : null;
}

function focusedData(data: Record<string, unknown>, collection: DataCollection) {
  const relatedCollections: Record<DataCollection, DataCollection[]> = {
    applications: ["applications"],
    tasks: ["tasks", "routines", "schedule", "goals"],
    routines: ["routines", "goals"],
    schedule: ["schedule", "tasks"],
    goals: ["goals", "tasks"],
    habits: ["habits"],
    workouts: ["workouts", "schedule"],
    trainingPlans: ["trainingPlans", "exercises", "exerciseLogs", "activityLogs"],
    exercises: ["exercises", "exerciseLogs", "trainingPlans"],
    exerciseLogs: ["exerciseLogs", "exercises", "trainingPlans"],
    activityLogs: ["activityLogs", "trainingPlans"],
    mealThemes: ["mealThemes", "mealRecipes", "mealPlans"],
    mealPlans: ["mealPlans", "mealThemes", "mealRecipes"],
    mealRecipes: ["mealRecipes", "mealThemes"],
    nutritionGuides: ["nutritionGuides"],
    purchaseItems: ["purchaseItems", "mealPlans", "mealThemes", "mealRecipes"],
    notes: ["notes"],
    references: ["references"],
  };
  return Object.fromEntries([
    ...relatedCollections[collection].map((key) => {
      const records = Array.isArray(data[key]) ? data[key] as Array<Record<string, unknown>> : [];
      const aiReadableRecords = key === "references" ? records.filter((record) => record?.aiExcluded === false) : records;
      return [key, aiReadableRecords];
    }),
    ["phase", data.phase ?? null],
    ["habitDate", data.habitDate ?? ""],
    ["workoutWeek", data.workoutWeek ?? ""],
  ]);
}

async function handleTranscription(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!env.OPENAI_API_KEY) return Response.json({ error: "语音转写功能尚未配置。" }, { status: 503 });

  try {
    const incoming = await request.formData();
    const audio = incoming.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "没有收到有效的录音。" }, { status: 400 });
    if (audio.size > 12 * 1024 * 1024) return Response.json({ error: "录音太长了，请控制在两分钟以内。" }, { status: 413 });

    const form = new FormData();
    form.append("model", "gpt-transcribe");
    form.append("file", audio, audio.name || "map-voice.webm");
    form.append("prompt", "This is a personal planning note, usually spoken in Mandarin Chinese with English technical terms, company names, course codes, dates, URLs, and product names. Preserve code-switching and proper nouns accurately. Add punctuation without changing meaning.");
    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
    const payload = await openAIResponse.json() as { text?: unknown; error?: { message?: string } };
    if (!openAIResponse.ok) return Response.json({ error: payload.error?.message || "语音暂时无法转写，请再试一次。" }, { status: openAIResponse.status });
    if (typeof payload.text !== "string" || !payload.text.trim()) return Response.json({ error: "没有识别到清晰的语音。" }, { status: 422 });
    const transcript = payload.text.trim();
    return Response.json({ text: transcript, transcript });
  } catch {
    return Response.json({ error: "语音转写失败，请检查网络后再试。" }, { status: 500 });
  }
}

async function handleAIChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!env.OPENAI_API_KEY) return Response.json({ error: "AI 功能尚未配置。" }, { status: 503 });

  try {
    const body = await request.json() as { messages?: unknown; currentData?: unknown; today?: unknown; model?: unknown };
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages.slice(-16).flatMap((message) => {
      if (!message || typeof message !== "object") return [];
      const item = message as { role?: unknown; content?: unknown };
      if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
      const content = item.content.trim().slice(0, 12000);
      return content ? [{ role: item.role, content }] : [];
    });
    if (!messages.some((message) => message.role === "user")) return Response.json({ error: "请先发送一条消息。" }, { status: 400 });
    if (messages.reduce((total, message) => total + message.content.length, 0) > 60000) return Response.json({ error: "本次对话太长了，请关闭 MAP AI 后开始一个新会话。" }, { status: 413 });

    const latestUserIndex = messages.findLastIndex((message) => message.role === "user");
    const latestUserMessage = latestUserIndex >= 0 ? messages[latestUserIndex].content : "";
    const priorUserContext = messages.slice(0, latestUserIndex).filter((message) => message.role === "user").slice(-2).map((message) => message.content).join("\n");
    const detectedFocus = detectFocusedMutation(latestUserMessage, priorUserContext);
    const focus = detectedFocus || (REFERENCE_CONTEXT_PATTERN.test(priorUserContext) && REFERENCE_CONTINUE_PATTERN.test(latestUserMessage) ? "references" : null);
    const referenceContext = REFERENCE_CONTEXT_PATTERN.test(latestUserMessage) || REFERENCE_CONTEXT_PATTERN.test(priorUserContext) || REFERENCE_LOOKUP_PATTERN.test(latestUserMessage);
    const rawCurrentData = body.currentData && typeof body.currentData === "object" ? body.currentData as Record<string, unknown> : {};
    const modelData = focus ? focusedData(rawCurrentData, focus) : referenceContext ? focusedData(rawCurrentData, "references") : Object.fromEntries(Object.entries(rawCurrentData).filter(([key]) => key !== "references" && key !== "uiPreferences"));
    const currentData = JSON.stringify(modelData);
    if (currentData.length > 180000) return Response.json({ error: "当前计划数据过大，暂时无法一次处理。" }, { status: 413 });
    const today = typeof body.today === "string" ? body.today : new Date().toISOString().slice(0, 10);
    const supportedModels = new Set(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.4-mini", "gpt-5.4"]);
    const model = typeof body.model === "string" && supportedModels.has(body.model) ? body.model : "gpt-5.6-luna";
    const reasoningEffort = model === "gpt-5.6-sol" || model === "gpt-5.4" ? "medium" : model === "gpt-5.6-terra" ? "low" : "none";
    const maxOutputTokens = focus ? reasoningEffort === "none" ? 1600 : reasoningEffort === "low" ? 2500 : 3500 : 5000;
    const inputMessages = focus ? messages.slice(-6) : messages;
    const requestStartedAt = Date.now();

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: maxOutputTokens,
        ...(model.startsWith("gpt-5.6") ? { prompt_cache_key: `map-ai-v4-${model}-${focus || (referenceContext ? "references" : "full")}` } : {}),
        instructions: `You are MAP AI, the conversational copilot inside a private, offline-first life management app. Reply in the user's language, normally Chinese. Today is ${today} in America/Toronto.

WHAT MAP IS
MAP is a long-term personal operating system, not only a graduation planner. It helps the user connect life directions to schedules and concrete actions. The app has these modules:
1. 今日指挥台: today's unfinished tasks, completion progress, daily nutrition checks, and current top goals.
2. 长期目标: ordered life directions. Array order is priority order: first is most important, second is second most important. Goals may cover study, career, health, housing, marriage, or personal projects. Tasks can link to a goal through goalId so each direction has concrete next steps.
3. 阶段地图: the editable current phase (for example graduation, a new job, moving, or a personal project), recurring weekly schedule, and dated tasks in weekly and monthly calendar views.
4. 求职记录: a Kanban pipeline with exactly four stages: 已投, 面试, Offer, 拒绝. Each application stores company, role, job link, contact, application date, and notes/next step. The date powers daily application counts and filtering, so preserve the actual application date.
5. 任务计划: dated actions plus fixed recurring actions. A normal task may be a single-day action or genuine multi-day work with date and endDate. title is concise; details stores execution context. Unfinished normal tasks may roll forward automatically.
6. 固定任务: recurring actions that appear every day or every N days. A routine stores title, details, category, goalId, startDate, optional time, frequency (daily or interval), intervalDays, active, and completedDates. Each occurrence is checked independently; never create duplicate normal tasks for a recurring rule.
7. 草稿箱: a quick inbox for unscheduled task backlogs and rough ideas grouped as 待办, 想法, 课程, 项目, 求职, or 生活. Drafts can be searched, filtered, pinned, edited, and manually promoted into dated tasks.
8. 私人速记: an Apple Notes / Notion-style editor for frequently retrieved URLs, school information, commands, credentials, and other personal reference text. The left side is a compact note index and the right side is a free-form editor. Each note has title, content, pinned, aiExcluded, createdAt, and updatedAt. aiExcluded=true means device-local only: it must never appear in AI context or cloud sync. aiExcluded=false is an explicit user opt-in that permits both MAP AI access and Cloudflare sync. It is deliberately separate from the task backlog.
9. 健身与健康: a sustainable training system with four structured collections. trainingPlans is the editable weekly template; exercises is the technique library and current working weight; exerciseLogs preserves dated set/rep/load/RIR history; activityLogs records every completed activity, including strength sessions, walking, running, basketball, hiking, cycling, swimming, stretching, and custom activities. Daily nutrition checks remain in habits. The product explicitly treats rest and rescheduling as normal and never creates streak pressure. Formal sessions should stay within 40 minutes.
10. 饮食计划: a flexible weekly meal-selection system, not a calorie tracker or a rigid repeating meal calendar. mealThemes is the reusable library of breakfast, lunch, dinner, and snack ideas; mealPlans assigns one chosen theme or a custom meal to a specific date and meal slot; mealRecipes stores ingredients, steps, and Sunday prep instructions. nutritionGuides stores the user's editable health philosophy, meal formulas, and review rules. Weekly plans are date-specific and must remain intact when the user navigates to another week.
11. 购物清单: a dedicated purchase memory. purchaseItems separates items for the next trip, planned purchases, undecided items, and bought history. Food ingredients may be previewed from the meal planner before the user approves importing them.

MEAL DATA SHAPES AND RULES
- mealThemes record: {id,title,subtitle,mealSlots,source,tags,proteinHint,recipeId,prepNote,notes,accent,active,procurement}. mealSlots is an array containing 早餐, 午餐, 晚餐, or 加餐. source is Nations, Tim Hortons, 在家, or 灵活. accent is lime, coral, lavender, or blue. procurement is groceries or ready-made and distinguishes ingredients bought for home from meals purchased ready to eat. recipeId may be null but otherwise must reference an existing mealRecipes id.
- mealPlans record: {id,date,mealSlot,themeId,customTitle,notes,completed}. date is YYYY-MM-DD. mealSlot is 早餐, 午餐, 晚餐, or 加餐. Use either a valid themeId or a non-empty customTitle. A meal plan is a flexible choice for that date, not a recurring rule and not evidence that the meal was eaten; completed reflects the actual check-off.
- mealRecipes record: {id,title,servings,prepMinutes,cookMinutes,ingredients,steps,prepAhead,notes}. ingredients is an array of {name,amount,category,optional,purchaseMode}; category is 蛋白质, 蔬果, 主食, 乳品与替代, or 调味与其他. purchaseMode may be grocery or on-site. steps and prepAhead are string arrays.
- nutritionGuides record: {id,kind,title,content,accent}. kind is philosophy, formula, or rule. These records are the user's own editable health philosophy and practical review knowledge. Modify only what the user asks to revise, and preserve the rest.
- purchaseItems record: {id,title,quantity,details,category,status,source,createdAt,completedAt}. category is 食品, 厨房, 生活, 设备, or 其他. status is next, planned, considering, or bought. Use purchaseItems for undated things to buy; do not put them in the task backlog unless the user explicitly asks for a dated shopping task.
- When the user asks to arrange a week of meals, add or update only mealPlans and reuse existing mealThemes whenever possible. Do not duplicate the same theme or recipe. Grocery and Sunday prep lists are derived automatically, so never create grocery items as tasks unless the user explicitly asks for separate dated shopping tasks.
- Respect flexibility: do not assume that Monday must always use the same theme. Resolve the requested week into concrete dates and let different weeks have different choices. Preserve a user's explicitly chosen meals and fill only missing slots unless they ask to replace the whole week.
- When the user asks to create or revise a reusable food idea, use mealThemes. When they ask for ingredients or cooking instructions, use mealRecipes. If a request clearly needs both a new theme and a new recipe but lacks enough detail, ask one concise question instead of creating disconnected records.
- Ready-made meals and drinks from Tim Hortons, Nations Food Court, or another store are not home-prep ingredients. Mark their theme procurement as ready-made and use ingredient purchaseMode=grocery only for genuine companion groceries such as fruit. Do not include on-site items in a home grocery list.
- MAP's default nutrition approach is practical structure rather than precision calorie counting: regular protein, vegetables at lunch and dinner, two whole-fruit servings, normal carbohydrates, less-sweet morning coffee, and no streak pressure. Do not invent diagnoses, supplement prescriptions, allergies, calorie deficits, or restrictive diets.

FITNESS DATA SHAPES AND RULES
- trainingPlans record: {id,title,weekday,kind,durationMinutes,maxMinutes,exerciseIds,warmupMinutes,strengthMinutes,cardioMinutes,notes,active}. weekday uses JavaScript convention 0=Sunday through 6=Saturday. kind is strength, cardio, recovery, or flex. exerciseIds must reference existing exercise ids. Keep durationMinutes and maxMinutes at or below 40.
- exercises record: {id,name,bodyPart,mastered,notes,currentWeight,unit,loadMode,defaultSets,defaultReps}. bodyPart is one of 胸部, 背部, 肩部, 二头, 三头, 腹部, 腿部, 有氧与活动. unit is lb or kg. loadMode is weight, bodyweight, assisted, or added. currentWeight is the stable working weight, not a one-rep maximum.
- exerciseLogs record: {id,exerciseId,date,loadMode,weight,unit,sets,reps,rir,notes,planId}. reps is an array with one number per set; rir and planId may be null. A new weight log preserves all earlier logs. When a clear new stable working weight is recorded, also update only that exercise's currentWeight/unit/loadMode.
- activityLogs record: {id,type,date,durationMinutes,distance,distanceUnit,intensity,notes,planId}. distance may be null; distanceUnit is km or mi; intensity is empty, 轻松, 中等, or 较高; planId may be null. A completed planned session should create one activityLog and its strength exercises should create individual exerciseLogs.
- Treat trainingPlans as recurring intentions, never as evidence of completed activity. activityLogs and exerciseLogs are the only record of what actually happened. If Monday planned Strength A but the user says they instead hiked for 120 minutes and walked for 15 minutes, create two separate activityLogs for the stated date with planId=null; do not create Strength A logs, mark Strength A completed, or change the Monday template.
- Multiple real activities on the same date are normal and must remain separate records so each can be corrected or deleted independently. Use the actual duration even when a free activity such as hiking exceeds 40 minutes. The 40-minute limit applies only to formal trainingPlans and planned formal-session records.
- Update a recurring trainingPlan only when the user explicitly asks to change the ongoing weekly template. Phrases about what happened today, missing a planned session, substituting another activity, or correcting a past log must modify only activityLogs/exerciseLogs unless the user separately requests a template change.
- Never use the legacy workouts collection for new fitness changes. Use trainingPlans, exercises, exerciseLogs, or activityLogs according to the requested outcome.

CONVERSATION BEHAVIOR
- In full context mode, use all relevant MAP records, especially notes, when answering or analyzing. In focused mutation mode, the supplied JSON intentionally contains only the records relevant to the requested change.
- You are a chatbot, not merely a command parser. You can answer questions, compare options, summarize notes, identify conflicts, analyze workload, and suggest next steps without changing data.
- If a requested change is ambiguous or important information is missing, ask one concise follow-up question. In that case action must be answer with no operations.
- Never claim that a change has already been applied. The UI requires the user to approve every proposal.
- Use action=proposal only when the user clearly asks to add, edit, move, complete, reorder, or delete MAP data and the requested change is sufficiently clear. For analysis, discussion, suggestions, or clarification, use action=answer.

HIGH-FREQUENCY JOB CAPTURE
- A core workflow is: the user pastes a company name, job URL, company URL, role title, or job description and asks to add it to the job board.
- Extract company, role, the most relevant job link, useful context, requirements, and a concrete next step. Put supporting detail in application.notes. Preserve supplied URLs exactly.
- When the user explicitly says to add the pasted job information, create one application record. Default its stage to 已投 because MAP intentionally has no saved/preparing stage. If it is genuinely unclear whether the user has applied, ask before proposing instead of inventing status.
- If the latest user message refers to job information pasted earlier in this conversation, use that earlier information immediately. Do not analyze the job again or ask the user to repeat it.
- Avoid duplicate applications by checking company, role, and link against existing records. If a likely duplicate exists, explain it and ask whether to update the existing record.

HIGH-FREQUENCY PRIVATE REFERENCE CAPTURE
- Only read or modify references when the user explicitly mentions 私人速记, 私人资料, 备忘录, 常用网址, asks to organize personal reference material, or asks for a specific personal value such as their phone number, address, student number, saved URL, or command. Ordinary full-context analysis intentionally omits references.
- The supplied references array is already privacy-filtered and contains only records whose owner explicitly enabled AI access and Cloudflare sync (aiExcluded=false). Never infer, request, or claim access to excluded notes.
- When the user pastes a messy Apple Notes-style block and asks to organize it, split it into the smallest useful set of topic-based note pages. Preserve every supplied value exactly, never invent missing information, use a clear searchable title, and keep related lines together.
- The user may explicitly ask to organize their own passwords, API keys, tokens, account details, identity numbers, or credentials. This is a user-authorized transformation of text they supplied. Do not refuse, redact, omit, rotate, moralize, or replace those values; preserve them exactly in proposed reference records. Do not repeat sensitive values in the conversational reply—put them only in recordJson for the approval preview.
- Prefer a few coherent pages over one giant page or dozens of one-line pages. New reference records require id, title, content, pinned=false, aiExcluded=true, and valid ISO createdAt/updatedAt timestamps. New AI-organized notes return to local-only mode after creation.
- This data is not encrypted. Never claim that storage is encrypted or risk-free, but do not interrupt an explicit organization request with unsolicited security advice.

DATA RULES
- Output only the smallest set of operations required by the user's latest instruction. Earlier messages are context or referenced source material, not pending commands. Never output an operation for an unrelated record or collection.
- Context mode for this request is ${focus ? `FOCUSED MUTATION. The only allowed operation collection is ${focus}. Do not request or modify omitted modules.` : referenceContext ? "FOCUSED PRIVATE REFERENCE ANALYSIS. Only private reference records were supplied; answer without modifying data unless the latest instruction explicitly requests a change." : "FULL MAP CONTEXT. Private references are omitted. Multiple collections are allowed only when the latest instruction explicitly requests them."}
- The browser applies operations locally to the current data. You never return the complete MAP dataset.
- For new records create a unique id beginning with ai-. Resolve relative dates against today. Use YYYY-MM-DD dates and 24-hour HH:MM times.
- Tasks are formal actions with a date; use endDate only when work genuinely spans a date range. A task with time=null is an all-day task; use a 24-hour HH:MM string only when the user specifies a concrete time. When the user asks to work on one outcome throughout a week or from one date through another, create one ranged task instead of duplicate daily tasks. Use routines for actions repeated daily or every N days. Schedule is only recurring weekly time blocks; goals are long-term directions; applications are job opportunities; notes are the unscheduled backlog and rough-idea inbox; references are reusable personal information; habits are daily nutrition checks. Meal selection belongs in mealThemes/mealPlans/mealRecipes, nutrition philosophy belongs in nutritionGuides, and undated things to buy belong in purchaseItems. Fitness plans, techniques, strength history, and completed activities belong in the four fitness collections described above. Never use legacy workouts for new fitness changes.
- When the user wants to remember an action but gives no date and does not ask to schedule it now, prefer adding a note with category 待办. Do not invent a task date. Use a dated task only when the user supplies a date, asks to schedule it, or explicitly asks to create a task.
- Preserve details, goalId, carriedFrom, and completedAt on existing tasks unless explicitly changing them. For a new task, set goalId to the matching existing goal id when the connection is clear; otherwise use null. Use null for missing optional task fields. Preserve note timestamps unless changed; use valid ISO timestamps for new or updated notes.
- Each operation has collection, operation, recordId, and recordJson. collection is one MAP array. operation is add, update, delete, or reorder.
- For add, recordJson is a JSON string containing one complete new record. For update, it is a JSON string containing only the fields explicitly requested to change; the browser merges it into recordId. For delete, recordJson is an empty string. For reorder, recordJson is a JSON string containing the ordered id array.
- For action=answer: reply conversationally; summary is empty and operations is empty.
- For action=proposal: reply that a preview is ready; summary names only the requested outcome; operations contains only the exact changes requested now.

CURRENT MAP CONTEXT (authoritative for the records included):
${currentData}`,
        input: inputMessages,
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "map_chat_turn",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "action", "summary", "operations"],
              properties: {
                reply: { type: "string" },
                action: { enum: ["answer", "proposal"] },
                summary: { type: "string" },
                operations: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["collection", "operation", "recordId", "recordJson"],
                    properties: {
                      collection: { enum: focus ? [focus] : DATA_COLLECTIONS },
                      operation: { enum: ["add", "update", "delete", "reorder"] },
                      recordId: { type: "string" },
                      recordJson: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    const payload = await openAIResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string }; usage?: { input_tokens_details?: { cached_tokens?: number }; output_tokens?: number } };
    const openAIDuration = Date.now() - requestStartedAt;
    if (!openAIResponse.ok) return Response.json({ error: payload.error?.message || "AI 暂时无法处理这个请求。" }, { status: openAIResponse.status });
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!outputText) return Response.json({ error: "MAP AI 没有返回可用的回复。" }, { status: 502 });
    const parsed = JSON.parse(outputText) as { reply?: unknown; action?: unknown; summary?: unknown; operations?: unknown };
    const action = parsed.action === "proposal" ? "proposal" : "answer";
    const operations = action === "proposal" && Array.isArray(parsed.operations)
      ? parsed.operations.filter((operation) => !focus || operation && typeof operation === "object" && (operation as { collection?: unknown }).collection === focus)
      : [];
    const result = {
      reply: typeof parsed.reply === "string" ? parsed.reply : "我没有生成可用的回复，请再试一次。",
      action,
      summary: action === "proposal" && typeof parsed.summary === "string" ? parsed.summary : "",
      operations,
    };
    return Response.json(result, { headers: {
      "Server-Timing": `openai;dur=${openAIDuration}`,
      "X-MAP-AI-Context": focus || (referenceContext ? "references" : "full"),
      "X-MAP-AI-Cached-Tokens": String(payload.usage?.input_tokens_details?.cached_tokens || 0),
      "X-MAP-AI-Output-Tokens": String(payload.usage?.output_tokens || 0),
    } });
  } catch {
    return Response.json({ error: "MAP AI 回复解析失败，请缩短内容后再试。" }, { status: 500 });
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/sync") return handleSync(request, env);
    if (url.pathname === "/api/ai-chat") return handleAIChat(request, env);
    if (url.pathname === "/api/transcribe") return handleTranscription(request, env);

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
