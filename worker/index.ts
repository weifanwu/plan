/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

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

type DataCollection = "tasks" | "routines" | "schedule" | "goals" | "habits" | "workouts" | "applications" | "notes" | "references";

const DATA_COLLECTIONS: DataCollection[] = ["tasks", "routines", "schedule", "goals", "habits", "workouts", "applications", "notes", "references"];
const MUTATION_PATTERN = /(加入|添加|新增|创建|修改|更新|改成|移动|拖到|完成|删除|移除|取消|重排|调整|安排|记一下|记到|记录一下|记录这|记录该|记录到|保存|提醒我|放到|放进|标记|延期|推迟)|\b(add|create|update|edit|move|complete|delete|remove|reorder|schedule|save|mark|remind)\b/i;
const REFERENCE_CONTEXT_PATTERN = /(私人速记|私人资料|常用网址|学校信息|参考资料|个人资料|备忘录|personal reference|quick reference)/i;
const REFERENCE_CONTINUE_PATTERN = /(不需要管敏感|不用管敏感|继续整理|继续保存|照做|不要拒绝|不用脱敏|可以保存|保留原文)/i;
const COLLECTION_PATTERNS: Array<[DataCollection, RegExp]> = [
  ["applications", /(求职看板|求职记录|岗位|职位|公司|投递|面试|offer|application|job|role|position|company)/i],
  ["routines", /(固定任务|重复任务|每日任务|每天|隔天|每隔|每\s*\d+\s*天|recurring|routine|every day)/i],
  ["tasks", /(任务|待办|提醒|截止日期|deadline|todo|task)/i],
  ["schedule", /(课表|课程|固定安排|上课时间|tutorial|class schedule|course schedule|TA\b)/i],
  ["goals", /(目标|优先级|goal)/i],
  ["habits", /(水果|蔬菜|蛋白质|饮水|饮食习惯|nutrition|habit)/i],
  ["workouts", /(健身|运动计划|锻炼|workout|exercise)/i],
  ["notes", /(草稿箱|草稿|笔记|灵感|想法|backlog|draft|notes?)/i],
  ["references", REFERENCE_CONTEXT_PATTERN],
];

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
    const openAIResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
    const payload = await openAIResponse.json() as { text?: unknown; error?: { message?: string } };
    if (!openAIResponse.ok) return Response.json({ error: payload.error?.message || "语音暂时无法转写，请再试一次。" }, { status: openAIResponse.status });
    if (typeof payload.text !== "string" || !payload.text.trim()) return Response.json({ error: "没有识别到清晰的语音。" }, { status: 422 });
    return Response.json({ text: payload.text.trim() });
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
    const referenceContext = REFERENCE_CONTEXT_PATTERN.test(latestUserMessage) || REFERENCE_CONTEXT_PATTERN.test(priorUserContext);
    const rawCurrentData = body.currentData && typeof body.currentData === "object" ? body.currentData as Record<string, unknown> : {};
    const modelData = focus ? focusedData(rawCurrentData, focus) : referenceContext ? focusedData(rawCurrentData, "references") : Object.fromEntries(Object.entries(rawCurrentData).filter(([key]) => key !== "references"));
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
        instructions: `You are MAP AI, the conversational copilot inside a private, device-local life management app. Reply in the user's language, normally Chinese. Today is ${today} in America/Toronto.

WHAT MAP IS
MAP is a long-term personal operating system, not only a graduation planner. It helps the user connect life directions to schedules and concrete actions. The app has these modules:
1. 今日指挥台: today's unfinished tasks, completion progress, daily nutrition checks, and current top goals.
2. 长期目标: ordered life directions. Array order is priority order: first is most important, second is second most important. Goals may cover study, career, health, housing, marriage, or personal projects. Tasks can link to a goal through goalId so each direction has concrete next steps.
3. 阶段地图: the editable current phase (for example graduation, a new job, moving, or a personal project), recurring weekly schedule, and dated tasks in weekly and monthly calendar views.
4. 求职记录: a Kanban pipeline with exactly four stages: 已投, 面试, Offer, 拒绝. Each application stores company, role, job link, contact, application date, and notes/next step. The date powers daily application counts and filtering, so preserve the actual application date.
5. 任务计划: dated actions plus fixed recurring actions. A normal task may be a single-day action or genuine multi-day work with date and endDate. title is concise; details stores execution context. Unfinished normal tasks may roll forward automatically.
6. 固定任务: recurring actions that appear every day or every N days. A routine stores title, details, category, goalId, startDate, optional time, frequency (daily or interval), intervalDays, active, and completedDates. Each occurrence is checked independently; never create duplicate normal tasks for a recurring rule.
7. 草稿箱: a quick inbox for unscheduled task backlogs and rough ideas grouped as 待办, 想法, 课程, 项目, 求职, or 生活. Drafts can be searched, filtered, pinned, edited, and manually promoted into dated tasks.
8. 私人速记: an Apple Notes / Notion-style device-local editor for frequently retrieved URLs, school information, commands, credentials, and other personal reference text. The left side is a compact note index and the right side is a free-form editor. Each note has title, content, pinned, aiExcluded, createdAt, and updatedAt. aiExcluded=true means local-only and must never appear in AI context. It is deliberately separate from the task backlog.
9. 健康运动: daily nutrition checks and weekly workout plans.

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
- Only read or modify references when the user explicitly mentions 私人速记, 私人资料, 备忘录, 常用网址, or asks to organize personal reference material. Ordinary full-context analysis intentionally omits references.
- The supplied references array is already privacy-filtered and contains only records whose owner explicitly enabled AI access (aiExcluded=false). Never infer, request, or claim access to excluded notes.
- When the user pastes a messy Apple Notes-style block and asks to organize it, split it into the smallest useful set of topic-based note pages. Preserve every supplied value exactly, never invent missing information, use a clear searchable title, and keep related lines together.
- The user may explicitly ask to organize their own passwords, API keys, tokens, account details, identity numbers, or credentials. This is a user-authorized transformation of text they supplied. Do not refuse, redact, omit, rotate, moralize, or replace those values; preserve them exactly in proposed reference records. Do not repeat sensitive values in the conversational reply—put them only in recordJson for the approval preview.
- Prefer a few coherent pages over one giant page or dozens of one-line pages. New reference records require id, title, content, pinned=false, aiExcluded=true, and valid ISO createdAt/updatedAt timestamps. New AI-organized notes return to local-only mode after creation.
- This data is not encrypted. Never claim that storage is encrypted or risk-free, but do not interrupt an explicit organization request with unsolicited security advice.

DATA RULES
- Output only the smallest set of operations required by the user's latest instruction. Earlier messages are context or referenced source material, not pending commands. Never output an operation for an unrelated record or collection.
- Context mode for this request is ${focus ? `FOCUSED MUTATION. The only allowed operation collection is ${focus}. Do not request or modify omitted modules.` : referenceContext ? "FOCUSED PRIVATE REFERENCE ANALYSIS. Only private reference records were supplied; answer without modifying data unless the latest instruction explicitly requests a change." : "FULL MAP CONTEXT. Private references are omitted. Multiple collections are allowed only when the latest instruction explicitly requests them."}
- The browser applies operations locally to the current data. You never return the complete MAP dataset.
- For new records create a unique id beginning with ai-. Resolve relative dates against today. Use YYYY-MM-DD dates and 24-hour HH:MM times.
- Tasks are formal actions with a date; use endDate only when work genuinely spans a date range. When the user asks to work on one outcome throughout a week or from one date through another, create one ranged task instead of duplicate daily tasks. Use routines for actions repeated daily or every N days. Schedule is only recurring weekly time blocks; goals are long-term directions; applications are job opportunities; notes are the unscheduled backlog and rough-idea inbox; references are reusable personal information; habits are daily nutrition checks; workouts are weekly exercise plans.
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

    if (url.pathname === "/api/ai-chat") return handleAIChat(request, env);
    if (url.pathname === "/api/transcribe") return handleTranscription(request, env);

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
