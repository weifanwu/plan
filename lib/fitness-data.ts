import type { ExerciseDefinition, TrainingPlan } from "./fitness-types";

const exercise = (
  id: string,
  name: string,
  bodyPart: ExerciseDefinition["bodyPart"],
  notes: string,
  currentWeight: number | null = null,
  unit: ExerciseDefinition["unit"] = "lb",
  loadMode: ExerciseDefinition["loadMode"] = "weight",
  defaultSets = 3,
  defaultReps = "8–12",
): ExerciseDefinition => ({ id, name, bodyPart, mastered: true, notes, currentWeight, unit, loadMode, defaultSets, defaultReps });

export const defaultExercises: ExerciseDefinition[] = [
  exercise("ex-incline-db-press", "上斜哑铃推胸", "胸部", "收下巴并保持头部位置；手臂和地面垂直，手腕打直；手臂内旋；肩不能往前送；手臂与身体约 45°，不能与身体垂直。聚焦上胸并向中间靠。下放至平行，不要过低；推起不要完全锁死。原笔记另记有“手臂尽量伸直并按摩”，训练前请确认其具体含义。", 35),
  exercise("ex-flat-db-press", "平板哑铃推胸", "胸部", "手臂保持垂直；自然挺胸，稳定肩胛。", 25),
  exercise("ex-incline-db-fly", "上斜哑铃飞鸟", "胸部", "让胸部充分拉开；手腕打直、肘部内收。手臂不要完全垂直地面；下放时略内八，减少二头代偿。这是单关节动作，优先控制而非追重。"),
  exercise("ex-bench-press", "卧推", "胸部", "自然弓背并挺胸；手臂与身体约 45°。", 35),
  exercise("ex-chest-press", "Chest Press", "胸部", "肩不能向前送；推起时保持肩胛稳定。"),

  exercise("ex-pull-up", "引体向上", "背部", "当前可完成约 10 个。手比肩宽、挺胸，拉至胸部接近杆；下落时手臂保持微屈。", null, "lb", "bodyweight", 3, "尽量稳定"),
  exercise("ex-lat-pulldown", "高位下拉", "背部", "挺胸沉肩，手臂内旋，握杆放松，肩胛骨保持收紧。补充：不必过度挺胸；放回时向两边放；小臂始终垂直；拉到鼻子附近即可。", 50),
  exercise("ex-seated-row", "坐姿划船", "背部", "向斜下方拉，背部保持紧张；用手肘而非手腕发力。原笔记写有“手肘要超过膝盖”；通用要点另记为手肘拉过背部，请结合器械位置复核。", 100),
  exercise("ex-one-arm-row", "单臂哑铃划船", "背部", "先向后摆动；肩胛骨向内移动；大臂和小臂在同一平面，手微高于躯干，贴身划动。", 27.56),
  exercise("ex-bent-row", "俯身划船", "背部", "双臂夹紧、身体向下、肩膀下沉、手肘内收；抬头但头部保持稳定，动作沿大腿流畅完成。"),
  exercise("ex-straight-arm-pulldown", "直臂下压", "背部", "手肘保持轻微弯曲，含胸抬头；用背部控制全程。"),

  exercise("ex-db-shoulder-press", "哑铃推肩", "肩部", "手背与小臂平行；大臂与中线约 30°。下放有斜度，顶部与头平行；肘关节向内挤，双手上推后向中间靠。原笔记写“力量来自臀部”，更可能是指臀部和躯干负责稳定；不要用臀部爆发借力，建议下次训练时复核。", 35),
  exercise("ex-lateral-raise", "哑铃侧平举", "肩部", "大臂和地面约 30°；顶部角度约 150°，底部约 170°；保持控制，不用爆发力。", 35),
  exercise("ex-reverse-pec-deck", "反向蝴蝶机飞鸟", "肩部", "手肘微屈且角度不变；含胸，肩向前送；外展约 2/3，避免用力过猛。", 70),
  exercise("ex-face-pull", "绳索面拉", "肩部", "拉到底时手肘、手和肩在同一平面；手肘与地面平行，向额头拉并感受外旋；顺势放回，手腕保持打直。", 30),
  exercise("ex-behind-neck-press", "颈后站姿杠铃推肩", "肩部", "小臂垂直；大臂不要垂直地面，保留角度；挺胸，为前臂留足空间。"),
  exercise("ex-smith-shoulder-press", "史密斯肩推", "肩部", "小臂垂直；大臂保留角度而非垂直；挺胸并稳定肩胛。"),

  exercise("ex-db-curl", "哑铃弯举", "二头", "肩胛骨下沉，不耸肩。窄握偏内侧、宽握偏外侧；握距会影响手臂受力与视觉线条。", 7.5),
  exercise("ex-ez-curl", "EZ 杠铃弯举", "二头", "正手和反手都可训练；保持肘部稳定，避免摆动借力。", 40, "kg"),

  exercise("ex-lying-triceps", "杠铃仰卧臂屈伸", "三头", "下放时虚握、抬起发力；大臂约与地面 90°，但不要过度垂直，以减少肘部压力。", 50),
  exercise("ex-db-up-press", "哑铃上推", "三头", "保持肘部稳定，避免爆发式推起。", 35),
  exercise("ex-overhead-triceps", "单哑铃过头臂屈伸", "三头", "控制下放，肘部朝前并尽量固定。", 50),
  exercise("ex-rope-pushdown", "绳索下压", "三头", "肘部固定在身体两侧，底端充分伸展但不锁死。", 55),

  exercise("ex-crunch", "卷腹", "腹部", "腰部不要抬起；顶部停留 1 秒，用上腹发力。", null, "lb", "bodyweight", 3, "12–15"),
  exercise("ex-scissor-kicks", "剪刀脚", "腹部", "下腹训练；臀部主导发力，身体稍后倾，双腿打直。", null, "lb", "bodyweight", 3, "20–30 秒"),
  exercise("ex-bicycle", "腹肌自行车", "腹部", "交替让左肘靠近右膝、右肘靠近左膝；接近时吐气。", null, "lb", "bodyweight", 3, "每侧 10–15"),
  exercise("ex-leg-twist", "抬脚转体", "腹部", "控制躯干旋转，保持腹部持续发力。", null, "lb", "bodyweight", 3, "每侧 10–15"),

  exercise("ex-leg-press", "腿推机", "腿部", "大腿与小腿约 90°；膝盖对准脚尖、不能内翻，双脚微开。另有 140 lb 的 Leg Press 记录，可能来自不同器械；比较进步时不要混用器械数据。", 120, "kg"),
  exercise("ex-hack-squat", "哈克深蹲", "腿部", "脚掌踏板约 1/3；膝盖对准脚尖；背部与靠背留约一掌宽，蹲至约 90°；颈部与靠背约 10°。"),
  exercise("ex-barbell-squat", "杠铃深蹲", "腿部", "小腿与背部尽量平行；左脚不要移位；膝盖对准脚尖，稳定地下蹲到足够深度。", 35),
  exercise("ex-smith-squat", "史密斯深蹲", "腿部", "大腿和小腿约 90°；手肘向下并尽量垂直地面；臀部向后，保持躯干稳定。"),
  exercise("ex-seated-leg-curl", "坐姿腿弯举", "腿部", "控制离心，不让重量快速回落。", 100),
  exercise("ex-leg-extension", "Leg Extension", "腿部", "当前重量未记录；伸膝时控制，不用爆发力。"),

  exercise("ex-running", "跑步 / 上坡快走", "有氧与活动", "进入微喘状态，目标心率可参考 135 以上；专注胸式呼吸，刻意练习用呼吸肌群稳定呼吸。", null, "lb", "bodyweight", 1, "10–40 分钟"),
  exercise("ex-post-run-stretch", "跑步后拉伸", "有氧与活动", "大腿前侧：单手拉脚后跟，身体直立不前倾。大腿后侧：背部挺直、腿伸直、脚尖立起，双手可放在膝盖上。", null, "lb", "bodyweight", 1, "5–8 分钟"),
  exercise("ex-scapular-hang", "肩胛悬挂活动", "有氧与活动", "悬挂时让肩胛自然活动，用于肩胛灵活性训练。", null, "lb", "bodyweight", 2, "8–12"),
  exercise("ex-basketball", "篮球控球与投篮", "有氧与活动", "可自由记录控球、投篮或完整篮球活动。", null, "lb", "bodyweight", 1, "20–40 分钟"),
  exercise("ex-general-principles", "训练通用原则", "有氧与活动", "所有动作避免爆发力，优先控制。引体向上要挺胸；直臂下压时手肘微屈、含胸抬头；高位下拉不必过度挺胸，放回时向两边放，小臂始终垂直，拉到鼻子附近即可；划船时手肘拉过背部；肩胛灵活性训练可用悬挂，让肩胛自然活动。", null, "lb", "bodyweight", 1, "训练前复习"),
];

export const defaultTrainingPlans: TrainingPlan[] = [
  { id: "plan-strength-a", title: "全身力量 A", weekday: 1, kind: "strength", durationMinutes: 40, maxMinutes: 40, exerciseIds: ["ex-leg-press", "ex-incline-db-press", "ex-seated-row", "ex-seated-leg-curl", "ex-face-pull", "ex-running"], warmupMinutes: 4, strengthMinutes: 26, cardioMinutes: 10, notes: "2–3 组 × 8–12 次；动作质量优先于加重。", active: true },
  { id: "plan-cardio", title: "稳态有氧", weekday: 2, kind: "cardio", durationMinutes: 35, maxMinutes: 40, exerciseIds: ["ex-running", "ex-post-run-stretch"], warmupMinutes: 4, strengthMinutes: 0, cardioMinutes: 31, notes: "跑步或上坡快走，维持可持续的微喘状态。", active: true },
  { id: "plan-recovery-wed", title: "休息 / 轻松散步", weekday: 3, kind: "recovery", durationMinutes: 20, maxMinutes: 40, exerciseIds: [], warmupMinutes: 0, strengthMinutes: 0, cardioMinutes: 20, notes: "休息完全正常；有精力再散步。", active: true },
  { id: "plan-strength-b", title: "全身力量 B", weekday: 4, kind: "strength", durationMinutes: 40, maxMinutes: 40, exerciseIds: ["ex-hack-squat", "ex-lat-pulldown", "ex-chest-press", "ex-seated-leg-curl", "ex-crunch", "ex-running"], warmupMinutes: 4, strengthMinutes: 26, cardioMinutes: 10, notes: "哈克或史密斯深蹲；引体向上或高位下拉可互换。", active: true },
  { id: "plan-recovery-fri", title: "休息 / 轻松散步", weekday: 5, kind: "recovery", durationMinutes: 20, maxMinutes: 40, exerciseIds: [], warmupMinutes: 0, strengthMinutes: 0, cardioMinutes: 20, notes: "按身体状态决定是否活动。", active: true },
  { id: "plan-strength-c", title: "全身力量 C", weekday: 6, kind: "strength", durationMinutes: 40, maxMinutes: 40, exerciseIds: ["ex-leg-press", "ex-flat-db-press", "ex-one-arm-row", "ex-db-shoulder-press", "ex-lateral-raise", "ex-running"], warmupMinutes: 4, strengthMinutes: 26, cardioMinutes: 10, notes: "腿推或史密斯深蹲；侧平举或面拉可互换。", active: true },
  { id: "plan-flex-sun", title: "自由活动", weekday: 0, kind: "flex", durationMinutes: 40, maxMinutes: 40, exerciseIds: ["ex-basketball", "ex-running"], warmupMinutes: 0, strengthMinutes: 0, cardioMinutes: 40, notes: "篮球、跑步、徒步、散步或休息，按精力选择。", active: true },
];
