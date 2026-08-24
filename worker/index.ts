/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const mapDataSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tasks", "schedule", "goals", "habits", "workouts", "applications", "notes", "habitDate", "workoutWeek"],
  properties: {
    tasks: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "details", "category", "date", "time", "endDate", "carriedFrom", "priority", "status"], properties: { id: { type: "string" }, title: { type: "string" }, details: { type: ["string", "null"] }, category: { enum: ["学业", "求职", "生活", "健康"] }, date: { type: "string" }, time: { type: ["string", "null"] }, endDate: { type: ["string", "null"] }, carriedFrom: { type: ["string", "null"] }, priority: { enum: ["high", "normal"] }, status: { enum: ["todo", "done"] } } } },
    schedule: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "code", "title", "kind", "days", "start", "end", "room", "detail", "color"], properties: { id: { type: "string" }, code: { type: "string" }, title: { type: "string" }, kind: { enum: ["课程", "TA", "个人"] }, days: { type: "array", items: { enum: ["Mo", "Tu", "We", "Th", "Fr"] } }, start: { type: "string" }, end: { type: "string" }, room: { type: "string" }, detail: { type: ["string", "null"] }, color: { enum: ["lime", "coral", "lavender", "blue"] } } } },
    goals: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "description", "metric", "progress", "tone"], properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, metric: { type: "string" }, progress: { type: "number", minimum: 0, maximum: 100 }, tone: { enum: ["lime", "coral", "lavender"] } } } },
    habits: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "done", "icon"], properties: { id: { type: "string" }, label: { type: "string" }, done: { type: "boolean" }, icon: { type: "string" } } } },
    workouts: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "day", "duration", "done"], properties: { id: { type: "string" }, title: { type: "string" }, day: { type: "string" }, duration: { type: "string" }, done: { type: "boolean" } } } },
    applications: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "company", "role", "stage", "link", "contact", "date", "notes"], properties: { id: { type: "string" }, company: { type: "string" }, role: { type: "string" }, stage: { enum: ["已投", "面试", "Offer", "拒绝"] }, link: { type: "string" }, contact: { type: "string" }, date: { type: "string" }, notes: { type: "string" } } } },
    notes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "content", "category", "pinned", "createdAt", "updatedAt"], properties: { id: { type: "string" }, content: { type: "string" }, category: { enum: ["课程", "项目", "求职", "生活", "想法"] }, pinned: { type: "boolean" }, createdAt: { type: "string" }, updatedAt: { type: "string" } } } },
    habitDate: { type: "string" },
    workoutWeek: { type: "string" },
  },
} as const;

async function handleAIChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!env.OPENAI_API_KEY) return Response.json({ error: "AI 功能尚未配置。" }, { status: 503 });

  try {
    const body = await request.json() as { messages?: unknown; currentData?: unknown; today?: unknown; model?: unknown };
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages.slice(-30).flatMap((message) => {
      if (!message || typeof message !== "object") return [];
      const item = message as { role?: unknown; content?: unknown };
      if ((item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
      const content = item.content.trim().slice(0, 12000);
      return content ? [{ role: item.role, content }] : [];
    });
    if (!messages.some((message) => message.role === "user")) return Response.json({ error: "请先发送一条消息。" }, { status: 400 });
    if (messages.reduce((total, message) => total + message.content.length, 0) > 90000) return Response.json({ error: "本次对话太长了，请关闭 MAP AI 后开始一个新会话。" }, { status: 413 });

    const currentData = JSON.stringify(body.currentData ?? {});
    if (currentData.length > 180000) return Response.json({ error: "当前计划数据过大，暂时无法一次处理。" }, { status: 413 });
    const today = typeof body.today === "string" ? body.today : new Date().toISOString().slice(0, 10);
    const model = body.model === "gpt-5.4" ? "gpt-5.4" : "gpt-5.4-mini";

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: model === "gpt-5.4" ? "high" : "low" },
        instructions: `You are MAP AI, the conversational copilot inside a private, device-local life management app. Reply in the user's language, normally Chinese. Today is ${today} in America/Toronto.

WHAT MAP IS
MAP is a long-term personal operating system, not only a graduation planner. It helps the user connect life directions to schedules and concrete actions. The app has these modules:
1. 今日指挥台: today's unfinished tasks, completion progress, daily nutrition checks, and current top goals.
2. 长期目标: ordered life directions. Array order is priority order: first is most important, second is second most important. Goals may cover study, career, health, housing, marriage, or personal projects.
3. 学期地图: recurring weekly course/TA schedule plus dated tasks in weekly and monthly calendar views.
4. 求职记录: a Kanban pipeline with exactly four stages: 已投, 面试, Offer, 拒绝. Each application stores company, role, job link, contact, record date, and notes/next step.
5. 任务计划: one-off dated actions. title is concise; details stores execution context such as location, steps, materials, links, or contacts. Unfinished tasks may roll forward automatically.
6. 灵感笔记: free-form ideas and reference material grouped as 课程, 项目, 求职, 生活, or 想法. Notes can be searched and pinned.
7. 健康运动: daily nutrition checks and weekly workout plans.

CONVERSATION BEHAVIOR
- You receive the complete current MAP JSON on every turn. Use all relevant records, especially notes, when answering questions or analyzing the user's situation.
- You are a chatbot, not merely a command parser. You can answer questions, compare options, summarize notes, identify conflicts, analyze workload, and suggest next steps without changing data.
- If a requested change is ambiguous or important information is missing, ask one concise follow-up question. In that case action must be answer and nextData must equal current data.
- Never claim that a change has already been applied. The UI requires the user to approve every proposal.
- Use action=proposal only when the user clearly asks to add, edit, move, complete, reorder, or delete MAP data and the requested change is sufficiently clear. For analysis, discussion, suggestions, or clarification, use action=answer.

HIGH-FREQUENCY JOB CAPTURE
- A core workflow is: the user pastes a company name, job URL, company URL, role title, or job description and asks to add it to the job board.
- Extract company, role, the most relevant job link, useful context, requirements, and a concrete next step. Put supporting detail in application.notes. Preserve supplied URLs exactly.
- When the user explicitly says to add the pasted job information, create one application record. Default its stage to 已投 because MAP intentionally has no saved/preparing stage. If it is genuinely unclear whether the user has applied, ask before proposing instead of inventing status.
- Avoid duplicate applications by checking company, role, and link against existing records. If a likely duplicate exists, explain it and ask whether to update the existing record.

DATA RULES
- Preserve every existing record, field, and id unless the user explicitly requests a related change. Never rewrite, complete, reorder, or delete unrelated data.
- For new records create a unique id beginning with ai-. Resolve relative dates against today. Use YYYY-MM-DD dates and 24-hour HH:MM times.
- Tasks are one-off actions; schedule is only recurring weekly blocks; goals are long-term directions; applications are job opportunities; notes are free-form ideas/reference; habits are daily nutrition checks; workouts are weekly exercise plans.
- Preserve details and carriedFrom on existing tasks. Use null for missing optional task fields. Preserve note timestamps unless changed; use valid ISO timestamps for new or updated notes.
- For action=answer: reply conversationally, summary must be an empty string, changes must be empty, and nextData must exactly equal CURRENT MAP DATA.
- For action=proposal: reply conversationally that a preview is ready, summary briefly names the intended outcome, changes lists concrete proposed edits, and nextData is the complete resulting MAP data.

CURRENT MAP DATA (authoritative):
${currentData}`,
        input: messages,
        text: {
          format: {
            type: "json_schema",
            name: "map_chat_turn",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "action", "summary", "changes", "nextData"],
              properties: {
                reply: { type: "string" },
                action: { enum: ["answer", "proposal"] },
                summary: { type: "string" },
                changes: { type: "array", items: { type: "string" } },
                nextData: mapDataSchema,
              },
            },
          },
        },
      }),
    });

    const payload = await openAIResponse.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; error?: { message?: string } };
    if (!openAIResponse.ok) return Response.json({ error: payload.error?.message || "AI 暂时无法处理这个请求。" }, { status: openAIResponse.status });
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    if (!outputText) return Response.json({ error: "MAP AI 没有返回可用的回复。" }, { status: 502 });
    return Response.json(JSON.parse(outputText));
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

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
