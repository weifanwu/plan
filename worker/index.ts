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
  required: ["tasks", "schedule", "goals", "habits", "workouts", "applications", "habitDate", "workoutWeek"],
  properties: {
    tasks: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "category", "date", "time", "endDate", "priority", "status"], properties: { id: { type: "string" }, title: { type: "string" }, category: { enum: ["学业", "求职", "生活", "健康"] }, date: { type: "string" }, time: { type: ["string", "null"] }, endDate: { type: ["string", "null"] }, priority: { enum: ["high", "normal"] }, status: { enum: ["todo", "done"] } } } },
    schedule: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "code", "title", "kind", "days", "start", "end", "room", "detail", "color"], properties: { id: { type: "string" }, code: { type: "string" }, title: { type: "string" }, kind: { enum: ["课程", "TA", "个人"] }, days: { type: "array", items: { enum: ["Mo", "Tu", "We", "Th", "Fr"] } }, start: { type: "string" }, end: { type: "string" }, room: { type: "string" }, detail: { type: ["string", "null"] }, color: { enum: ["lime", "coral", "lavender", "blue"] } } } },
    goals: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "description", "metric", "progress", "tone"], properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, metric: { type: "string" }, progress: { type: "number", minimum: 0, maximum: 100 }, tone: { enum: ["lime", "coral", "lavender"] } } } },
    habits: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "label", "done", "icon"], properties: { id: { type: "string" }, label: { type: "string" }, done: { type: "boolean" }, icon: { type: "string" } } } },
    workouts: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "day", "duration", "done"], properties: { id: { type: "string" }, title: { type: "string" }, day: { type: "string" }, duration: { type: "string" }, done: { type: "boolean" } } } },
    applications: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "company", "role", "stage", "link", "contact", "date", "notes"], properties: { id: { type: "string" }, company: { type: "string" }, role: { type: "string" }, stage: { enum: ["收藏", "准备", "已投", "面试", "Offer", "拒绝"] }, link: { type: "string" }, contact: { type: "string" }, date: { type: "string" }, notes: { type: "string" } } } },
    habitDate: { type: "string" },
    workoutWeek: { type: "string" },
  },
} as const;

async function handleAIPlan(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!env.OPENAI_API_KEY) return Response.json({ error: "AI 功能尚未配置。" }, { status: 503 });

  try {
    const body = await request.json() as { instruction?: unknown; currentData?: unknown; today?: unknown };
    const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 16000) : "";
    if (!instruction) return Response.json({ error: "请先写下你想安排的事情。" }, { status: 400 });

    const currentData = JSON.stringify(body.currentData ?? {});
    if (currentData.length > 180000) return Response.json({ error: "当前计划数据过大，暂时无法一次处理。" }, { status: 413 });
    const today = typeof body.today === "string" ? body.today : new Date().toISOString().slice(0, 10);

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-5.4-mini",
        store: false,
        reasoning: { effort: "low" },
        instructions: `You are MAP's careful personal planning engine. Convert the user's Chinese or English instruction into an updated copy of their structured personal planning data. Today is ${today} in America/Toronto. Preserve every existing record and every existing id unless the user explicitly requests a change or deletion. Never delete, complete, or rewrite unrelated records. For new records create a unique id beginning with ai-. Resolve relative dates such as today, tomorrow, and this Friday against the supplied date. Use 24-hour HH:MM times and YYYY-MM-DD dates. Tasks are for one-off actions; schedule is only for recurring weekly blocks; goals are long-term directions; applications are job opportunities; habits are daily nutrition checks; workouts are weekly exercise plans. If a detail is missing, choose a conservative useful default and mention it in changes. Return a concise Chinese summary, a Chinese list of concrete changes, and the complete resulting data.`,
        input: `用户指令：\n${instruction}\n\n当前 MAP 数据：\n${currentData}`,
        text: {
          format: {
            type: "json_schema",
            name: "map_plan_update",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "changes", "nextData"],
              properties: {
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
    if (!outputText) return Response.json({ error: "AI 没有返回可用的计划。" }, { status: 502 });
    return Response.json(JSON.parse(outputText));
  } catch {
    return Response.json({ error: "AI 计划解析失败，请缩短内容后再试。" }, { status: 500 });
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

    if (url.pathname === "/api/ai-plan") return handleAIPlan(request, env);

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
