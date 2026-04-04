import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const GROQ_MODEL = process.env.GROQ_MODEL_ID || "qwen/qwen3-32b";

type StudySessionFocusBand = "excellent" | "good" | "fair" | "low";

export interface GenerateStudySessionReportInput {
  session: {
    id: string;
    userId: string;
    fileId: string;
    fileName: string;
    status: string;
    sessionStart: string;
    sessionEnd: string | null;
    focusTimeSeconds: number;
    idleTimeSeconds: number;
    distractionCount: number;
    reportEmailSentAt: string | null;
    reportEmailLastAttemptAt: string | null;
    reportEmailLastError: string | null;
    reportEmailSendCount: number;
  };
  events: Array<{
    id: string;
    eventType: string;
    timestamp: string;
    eventData?: unknown;
  }>;
  distractions: Array<{
    id: string;
    distractionType: string;
    durationSeconds: number;
    timestamp: string;
    metadata?: unknown;
  }>;
  quizAttempts: Array<{
    attemptId: string;
    quizId: string;
    quizTitle: string;
    difficulty: string;
    score: number;
    totalQuestions: number;
    correctAnswers: number;
    percentage: number;
    submittedAt: string;
    answers?: Array<{
      questionId: string;
      questionText: string;
      selectedOptionIndex: number;
      selectedOption: string;
      correctOptionIndex: number;
      correctOption: string;
      isCorrect: boolean;
      explanation?: string | null;
    }>;
    insight: null | {
      id: string;
      strengths: string;
      weaknesses: string;
      weakAreas?: unknown;
      detailedInsights?: unknown;
      recommendedActions?: unknown;
      createdAt: string;
    };
  }>;
}

export interface StudySessionReport {
  session: {
    id: string;
    userId: string;
    fileId: string;
    fileName: string;
    status: string;
    sessionStart: Date;
    sessionEnd: Date | null;
    totalDurationSeconds: number;
    focusTimeSeconds: number;
    idleTimeSeconds: number;
    distractionCount: number;
    focusScore: number;
    distractionRatioPercentage: number;
    totalDurationLabel: string;
    focusedDurationLabel: string;
    idleDurationLabel: string;
  };
  activity: {
    totalEvents: number;
    breakdown: Record<string, number>;
  };
  distractions: {
    totalEvents: number;
    totalDurationSeconds: number;
    breakdown: Record<string, number>;
  };
  quiz: {
    attempted: boolean;
    totalAttempts: number;
    averagePercentage: number;
    bestPercentage: number;
    weakAreas: string[];
    latestInsight: {
      id: string;
      strengths: string;
      weaknesses: string;
      weakAreas: string[];
      recommendedActions: string[];
      createdAt: Date;
    } | null;
    attempts: Array<{
      attemptId: string;
      quizId: string;
      quizTitle: string;
      difficulty: string;
      score: number;
      totalQuestions: number;
      correctAnswers: number;
      percentage: number;
      submittedAt: Date;
      insight: {
        id: string;
        weakAreas: string[];
        strengths: string;
        weaknesses: string;
      } | null;
    }>;
  };
  improvement: {
    summary: string;
    focusBand: StudySessionFocusBand;
    strengths: string[];
    risks: string[];
    recommendations: string[];
    nextSessionChecklist: string[];
  };
  emailDelivery: {
    sentAt: Date | null;
    lastAttemptAt: Date | null;
    lastError: string | null;
    sendCount: number;
  };
}

/**
 * System prompts for different AI tasks
 */
export const PROMPTS = {
  DOCUMENT_SUMMARY: {
    system: `You are an expert academic assistant specializing in creating comprehensive, well-structured summaries of educational materials. Your summaries should:

1. Capture all key concepts, theories, and important details
2. Maintain academic rigor and precision
3. Organize information hierarchically (main topics → subtopics → details)
4. Highlight important definitions, formulas, and key takeaways
5. Use clear, concise language suitable for students
6. Preserve technical terms and explain them when necessary
7. Include relevant examples or case studies mentioned in the material

Format your summary with:
- A brief overview (2-3 sentences)
- Main sections with clear headings
- Bullet points for key concepts
- A conclusion highlighting the most critical information

Keep the summary comprehensive but concise, focusing on what a student needs to understand and remember.`,

    user: (documentTitle: string, documentContent: string, metadata?: any) => `
Please create a comprehensive summary of the following educational material:

**Document Title:** ${documentTitle}

**Content:**
${documentContent}

${metadata ? `**Additional Context:** ${JSON.stringify(metadata, null, 2)}` : ""}

Generate a well-structured, academically rigorous summary that will help students understand and retain the key information.`,
  },

  CHUNK_SYNTHESIS: {
    system: `You are an expert at synthesizing information from multiple document chunks into a coherent, comprehensive summary. Your task is to:

1. Identify and connect related concepts across different chunks
2. Eliminate redundancy while preserving all unique information
3. Maintain logical flow and structure
4. Preserve important details, examples, and technical terms
5. Create a unified narrative that reads naturally

Organize the information logically, not just in the order chunks were provided.`,

    user: (
      documentTitle: string,
      chunks: Array<{ content: string; page?: number; metadata?: any }>,
    ) => `
Create a comprehensive summary by synthesizing the following chunks from: **${documentTitle}**

${chunks
  .map(
    (chunk, idx) => `
--- Chunk ${idx + 1} ${chunk.page ? `(Page ${chunk.page})` : ""} ---
${chunk.content}
`,
  )
  .join("\n")}

Synthesize these chunks into a single, well-organized summary that captures all important information.`,
  },

  CONCEPT_EXTRACTION: {
    system: `You are an expert at identifying and explaining key concepts from educational materials. Extract the most important concepts, theories, and ideas, providing clear, concise explanations for each.`,

    user: (content: string) => `
Extract the key concepts from the following content:

${content}

For each concept, provide:
1. The concept name
2. A clear definition or explanation (2-3 sentences)
3. Why it's important

Format as a structured list.`,
  },

  STUDY_SESSION_REPORT: {
    system: `You are an expert study analytics coach.
Your task is to read the full raw study-session payload and return one valid JSON object only.

Rules:
- Return only JSON. No markdown fences, prose, or explanations outside JSON.
- Preserve all IDs and file/session identity fields exactly from the input.
- Derive every metric from the provided input only.
- Keep every top-level key present: session, activity, distractions, quiz, improvement, emailDelivery.
- Use ISO 8601 strings for all date values.
- Use integers for counts and duration fields.
- Percentages and scores may have up to 2 decimal places.
- improvement.focusBand must be one of: "excellent", "good", "fair", "low".
- latestInsight.recommendedActions, quiz.weakAreas, improvement.strengths, improvement.risks, improvement.recommendations, and improvement.nextSessionChecklist must be arrays of concise plain strings.
- If a value does not exist, use null, false, 0, {}, or [] as appropriate. Do not omit required keys.`,

    user: (payload: GenerateStudySessionReportInput) => `
Generate a study session report from this full raw session payload.

Return JSON with this exact shape:
{
  "session": {
    "id": "string",
    "userId": "string",
    "fileId": "string",
    "fileName": "string",
    "status": "ACTIVE | COMPLETED | INCOMPLETE",
    "sessionStart": "ISO date string",
    "sessionEnd": "ISO date string or null",
    "totalDurationSeconds": 0,
    "focusTimeSeconds": 0,
    "idleTimeSeconds": 0,
    "distractionCount": 0,
    "focusScore": 0,
    "distractionRatioPercentage": 0,
    "totalDurationLabel": "e.g. 42m",
    "focusedDurationLabel": "e.g. 35m",
    "idleDurationLabel": "e.g. 7m"
  },
  "activity": {
    "totalEvents": 0,
    "breakdown": {
      "EVENT_NAME": 0
    }
  },
  "distractions": {
    "totalEvents": 0,
    "totalDurationSeconds": 0,
    "breakdown": {
      "DISTRACTION_NAME": 0
    }
  },
  "quiz": {
    "attempted": false,
    "totalAttempts": 0,
    "averagePercentage": 0,
    "bestPercentage": 0,
    "weakAreas": ["topic"],
    "latestInsight": {
      "id": "string",
      "strengths": "string",
      "weaknesses": "string",
      "weakAreas": ["topic"],
      "recommendedActions": ["action"],
      "createdAt": "ISO date string"
    },
    "attempts": [
      {
        "attemptId": "string",
        "quizId": "string",
        "quizTitle": "string",
        "difficulty": "string",
        "score": 0,
        "totalQuestions": 0,
        "correctAnswers": 0,
        "percentage": 0,
        "submittedAt": "ISO date string",
        "insight": {
          "id": "string",
          "weakAreas": ["topic"],
          "strengths": "string",
          "weaknesses": "string"
        }
      }
    ]
  },
  "improvement": {
    "summary": "string",
    "focusBand": "excellent",
    "strengths": ["string"],
    "risks": ["string"],
    "recommendations": ["string"],
    "nextSessionChecklist": ["string"]
  },
  "emailDelivery": {
    "sentAt": "ISO date string or null",
    "lastAttemptAt": "ISO date string or null",
    "lastError": "string or null",
    "sendCount": 0
  }
}

Raw session payload:
${JSON.stringify(payload, null, 2)}
`,
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonFromAi<T>(rawContent: string): T {
  const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const payload = fencedMatch ? fencedMatch[1] : rawContent;

  try {
    return JSON.parse(payload) as T;
  } catch {
    const start = payload.indexOf("{");
    const end = payload.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(payload.slice(start, end + 1)) as T;
    }

    throw new Error("AI returned invalid JSON");
  }
}

function parseDateValue(
  value: unknown,
  fallback: Date | null = null,
): Date | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function toPercentage(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return clamp(Number(parsed.toFixed(2)), 0, 100);
}

function toText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const normalized = value.trim();
  return normalized || fallback;
}

function toOptionalText(
  value: unknown,
  fallback: string | null,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim();
  return normalized || null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(/[\n,;|]/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (isRecord(value) && "topics" in value) {
    return parseStringList(value.topics);
  }

  return [];
}

function parseActionLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").replace(/^[-*#\s]+/, "").trim())
      .filter((item) => item.length > 0)
      .slice(0, 8);
  }

  return String(value || "")
    .split("\n")
    .map((line) => line.replace(/^[-*#\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 8);
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function toStringArray(
  value: unknown,
  fallback: string[],
  limit?: number,
): string[] {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = uniqueStrings(parseStringList(value));
  return typeof limit === "number" ? parsed.slice(0, limit) : parsed;
}

function toDurationSeconds(start: Date, end: Date | null): number {
  if (!end) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function formatDurationLabel(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const parts = [
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    hours === 0 && minutes === 0 ? `${seconds}s` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

function getFocusBand(score: number): StudySessionFocusBand {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 55) return "fair";
  return "low";
}

function buildImprovementPlan(input: {
  status: string;
  totalDurationSeconds: number;
  focusTimeSeconds: number;
  idleTimeSeconds: number;
  distractionCount: number;
  distractionRatioPercentage: number;
  focusScore: number;
  totalQuizAttempts: number;
  averageQuizPercentage: number;
  aggregatedWeakAreas: string[];
  latestRecommendedActions: string[];
}) {
  const strengths: string[] = [];
  const risks: string[] = [];
  const recommendations: string[] = [];
  const nextSessionChecklist: string[] = [];

  if (input.status === "COMPLETED") {
    strengths.push(
      "You finished the study session and captured a complete learning block.",
    );
  } else {
    risks.push(
      "The session ended as incomplete, which may have reduced consolidation.",
    );
    recommendations.push(
      "Close the next session with a short recap so the material is not left half-finished.",
    );
  }

  const focusBand = getFocusBand(input.focusScore);
  if (focusBand === "excellent") {
    strengths.push(
      `Focus was strong for most of the session (${input.focusScore.toFixed(2)}% focused time).`,
    );
  } else if (focusBand === "good") {
    strengths.push(
      `Focus held up reasonably well (${input.focusScore.toFixed(2)}% focused time).`,
    );
    recommendations.push(
      "Push the next session slightly closer to deep-work mode by trimming avoidable interruptions.",
    );
  } else if (focusBand === "fair") {
    risks.push(
      `Focus was inconsistent (${input.focusScore.toFixed(2)}% focused time).`,
    );
    recommendations.push(
      "Use a fixed study block with a visible timer and avoid switching context mid-session.",
    );
  } else {
    risks.push(
      `Most of the session was lost to idle or off-task time (${input.idleTimeSeconds}s idle).`,
    );
    recommendations.push(
      "Shorten the next session to a tighter focus sprint and pause non-essential tabs or apps before starting.",
    );
  }

  if (input.distractionCount === 0) {
    strengths.push("No distraction events were recorded.");
  } else if (
    input.distractionCount <= 2 &&
    input.distractionRatioPercentage <= 10
  ) {
    strengths.push("Distractions were present but still kept under control.");
  } else {
    risks.push(
      `${input.distractionCount} distraction events interrupted the session.`,
    );
    recommendations.push(
      "Keep one study window open, mute notifications, and batch non-study checks for the break.",
    );
  }

  if (input.totalDurationSeconds >= 1500) {
    strengths.push(
      `You sustained a meaningful study block (${formatDurationLabel(input.totalDurationSeconds)} total).`,
    );
  } else {
    recommendations.push(
      "Aim for at least 25 focused minutes so you have enough time to review and test recall.",
    );
  }

  if (input.totalQuizAttempts > 0) {
    if (input.averageQuizPercentage >= 80) {
      strengths.push(
        `Quiz performance indicates strong retention (${input.averageQuizPercentage.toFixed(2)}% average).`,
      );
    } else if (input.averageQuizPercentage >= 60) {
      risks.push(
        `Quiz performance was mixed (${input.averageQuizPercentage.toFixed(2)}% average).`,
      );
      recommendations.push(
        "Review the missed quiz concepts immediately after studying instead of leaving them for later.",
      );
    } else {
      risks.push(
        `Quiz results show weak retention (${input.averageQuizPercentage.toFixed(2)}% average).`,
      );
      recommendations.push(
        "Re-read the weakest concepts and explain them in your own words before attempting another quiz.",
      );
    }

    if (input.aggregatedWeakAreas.length > 0) {
      recommendations.push(
        `Prioritize these weak areas next: ${input.aggregatedWeakAreas.slice(0, 3).join(", ")}.`,
      );
    }
  } else {
    risks.push(
      "No quiz was attempted, so recall was not checked during this session.",
    );
    recommendations.push(
      "Finish the next session with a short quiz or self-test to confirm retention.",
    );
    nextSessionChecklist.push(
      "Attempt a 5-10 question quiz before ending the next session.",
    );
  }

  nextSessionChecklist.push(
    "Set one concrete learning target before starting the session.",
    "Review distraction triggers and remove the top one before you begin.",
  );

  if (input.latestRecommendedActions.length > 0) {
    nextSessionChecklist.push(...input.latestRecommendedActions.slice(0, 2));
  }

  const finalRecommendations = uniqueStrings(recommendations).slice(0, 6);
  const finalChecklist = uniqueStrings(nextSessionChecklist).slice(0, 5);
  const finalStrengths = uniqueStrings(strengths).slice(0, 4);
  const finalRisks = uniqueStrings(risks).slice(0, 4);

  if (finalRecommendations.length === 0) {
    finalRecommendations.push(
      "Repeat this study structure and keep ending with a short recall check.",
    );
  }

  let summary = `Session quality was ${focusBand}. `;
  if (input.totalQuizAttempts > 0) {
    summary += `You focused for ${formatDurationLabel(input.focusTimeSeconds)} and averaged ${input.averageQuizPercentage.toFixed(2)}% across quizzes.`;
  } else {
    summary += `You focused for ${formatDurationLabel(input.focusTimeSeconds)} but did not validate retention with a quiz.`;
  }

  return {
    summary,
    focusBand,
    strengths: finalStrengths,
    risks: finalRisks,
    recommendations: finalRecommendations,
    nextSessionChecklist: finalChecklist,
  };
}

function toCountRecord(
  value: unknown,
  fallback: Record<string, number>,
): Record<string, number> {
  if (!isRecord(value)) {
    return fallback;
  }

  const normalized: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const trimmedKey = key.trim();
    const count = Number(rawValue);

    if (!trimmedKey || !Number.isFinite(count) || count < 0) {
      continue;
    }

    normalized[trimmedKey] = Math.floor(count);
  }

  return normalized;
}

function buildFallbackStudySessionReport(
  input: GenerateStudySessionReportInput,
): StudySessionReport {
  const sessionStart = parseDateValue(input.session.sessionStart, new Date());
  if (!sessionStart) {
    throw new Error("Study session payload is missing a valid sessionStart");
  }

  const sessionEnd = parseDateValue(input.session.sessionEnd, null);
  const endedAt = sessionEnd ?? new Date();
  const totalDurationSeconds = toDurationSeconds(sessionStart, endedAt);
  const distractionDurationSeconds = input.distractions.reduce(
    (total, item) =>
      total + Math.max(0, Math.floor(Number(item.durationSeconds) || 0)),
    0,
  );
  const idleTimeSeconds = Math.max(
    toNonNegativeInteger(input.session.idleTimeSeconds, 0),
    distractionDurationSeconds,
  );
  const focusTimeSeconds =
    toNonNegativeInteger(input.session.focusTimeSeconds, 0) > 0
      ? toNonNegativeInteger(input.session.focusTimeSeconds, 0)
      : Math.max(0, totalDurationSeconds - idleTimeSeconds);
  const distractionRatioPercentage =
    totalDurationSeconds > 0
      ? Number(((idleTimeSeconds / totalDurationSeconds) * 100).toFixed(2))
      : 0;
  const focusScore =
    totalDurationSeconds > 0
      ? Number(((focusTimeSeconds / totalDurationSeconds) * 100).toFixed(2))
      : 0;

  const eventBreakdown = input.events.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.eventType] = (acc[item.eventType] || 0) + 1;
      return acc;
    },
    {},
  );

  const distractionBreakdown = input.distractions.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.distractionType] = (acc[item.distractionType] || 0) + 1;
      return acc;
    },
    {},
  );

  const totalQuizAttempts = input.quizAttempts.length;
  const averageQuizPercentage =
    totalQuizAttempts > 0
      ? Number(
          (
            input.quizAttempts.reduce(
              (sum, item) => sum + Number(item.percentage || 0),
              0,
            ) / totalQuizAttempts
          ).toFixed(2),
        )
      : 0;
  const bestQuizPercentage =
    totalQuizAttempts > 0
      ? Number(
          Math.max(
            ...input.quizAttempts.map((attempt) => Number(attempt.percentage || 0)),
          ).toFixed(2),
        )
      : 0;

  const weakAreaCounts = new Map<string, number>();
  for (const attempt of input.quizAttempts) {
    const weakAreas = parseStringList(attempt.insight?.weakAreas);
    for (const weakArea of weakAreas) {
      weakAreaCounts.set(weakArea, (weakAreaCounts.get(weakArea) || 0) + 1);
    }
  }

  const aggregatedWeakAreas = Array.from(weakAreaCounts.entries())
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([topic]) => topic);

  const latestAttemptWithInsight =
    input.quizAttempts.find((attempt) => attempt.insight) || null;
  const latestRecommendedActions = parseActionLines(
    latestAttemptWithInsight?.insight?.recommendedActions,
  );
  const improvement = buildImprovementPlan({
    status: input.session.status,
    totalDurationSeconds,
    focusTimeSeconds,
    idleTimeSeconds,
    distractionCount: toNonNegativeInteger(input.session.distractionCount, 0),
    distractionRatioPercentage,
    focusScore: clamp(focusScore, 0, 100),
    totalQuizAttempts,
    averageQuizPercentage,
    aggregatedWeakAreas,
    latestRecommendedActions,
  });

  return {
    session: {
      id: input.session.id,
      userId: input.session.userId,
      fileId: input.session.fileId,
      fileName: input.session.fileName,
      status: input.session.status,
      sessionStart,
      sessionEnd,
      totalDurationSeconds,
      focusTimeSeconds,
      idleTimeSeconds,
      distractionCount: toNonNegativeInteger(input.session.distractionCount, 0),
      focusScore: clamp(focusScore, 0, 100),
      distractionRatioPercentage,
      totalDurationLabel: formatDurationLabel(totalDurationSeconds),
      focusedDurationLabel: formatDurationLabel(focusTimeSeconds),
      idleDurationLabel: formatDurationLabel(idleTimeSeconds),
    },
    activity: {
      totalEvents: input.events.length,
      breakdown: eventBreakdown,
    },
    distractions: {
      totalEvents: input.distractions.length,
      totalDurationSeconds: distractionDurationSeconds,
      breakdown: distractionBreakdown,
    },
    quiz: {
      attempted: totalQuizAttempts > 0,
      totalAttempts: totalQuizAttempts,
      averagePercentage: averageQuizPercentage,
      bestPercentage: bestQuizPercentage,
      weakAreas: aggregatedWeakAreas,
      latestInsight: latestAttemptWithInsight?.insight
        ? {
            id: latestAttemptWithInsight.insight.id,
            strengths: latestAttemptWithInsight.insight.strengths,
            weaknesses: latestAttemptWithInsight.insight.weaknesses,
            weakAreas: parseStringList(latestAttemptWithInsight.insight.weakAreas),
            recommendedActions: latestRecommendedActions,
            createdAt:
              parseDateValue(
                latestAttemptWithInsight.insight.createdAt,
                new Date(),
              ) || new Date(),
          }
        : null,
      attempts: input.quizAttempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        quizId: attempt.quizId,
        quizTitle: attempt.quizTitle,
        difficulty: attempt.difficulty,
        score: toNonNegativeInteger(attempt.score, 0),
        totalQuestions: toNonNegativeInteger(attempt.totalQuestions, 0),
        correctAnswers: toNonNegativeInteger(attempt.correctAnswers, 0),
        percentage: toPercentage(attempt.percentage, 0),
        submittedAt:
          parseDateValue(attempt.submittedAt, new Date()) || new Date(),
        insight: attempt.insight
          ? {
              id: attempt.insight.id,
              weakAreas: parseStringList(attempt.insight.weakAreas),
              strengths: attempt.insight.strengths,
              weaknesses: attempt.insight.weaknesses,
            }
          : null,
      })),
    },
    improvement,
    emailDelivery: {
      sentAt: parseDateValue(input.session.reportEmailSentAt, null),
      lastAttemptAt: parseDateValue(input.session.reportEmailLastAttemptAt, null),
      lastError: input.session.reportEmailLastError || null,
      sendCount: toNonNegativeInteger(input.session.reportEmailSendCount, 0),
    },
  };
}

function normalizeAttemptInsight(
  value: unknown,
  fallback: StudySessionReport["quiz"]["attempts"][number]["insight"],
) {
  if (!fallback) {
    return null;
  }

  if (!isRecord(value)) {
    return fallback;
  }

  return {
    id: toText(value.id, fallback.id),
    weakAreas: toStringArray(value.weakAreas, fallback.weakAreas, 8),
    strengths: toText(value.strengths, fallback.strengths),
    weaknesses: toText(value.weaknesses, fallback.weaknesses),
  };
}

function normalizeLatestInsight(
  value: unknown,
  fallback: StudySessionReport["quiz"]["latestInsight"],
) {
  if (!fallback) {
    return null;
  }

  if (!isRecord(value)) {
    return fallback;
  }

  return {
    id: toText(value.id, fallback.id),
    strengths: toText(value.strengths, fallback.strengths),
    weaknesses: toText(value.weaknesses, fallback.weaknesses),
    weakAreas: toStringArray(value.weakAreas, fallback.weakAreas, 8),
    recommendedActions: toStringArray(
      value.recommendedActions,
      fallback.recommendedActions,
      8,
    ),
    createdAt:
      parseDateValue(value.createdAt, fallback.createdAt) || fallback.createdAt,
  };
}

function normalizeQuizAttempts(
  value: unknown,
  fallback: StudySessionReport["quiz"]["attempts"],
) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return fallback.map((attempt, index) => {
    const rawAttempt = value[index];
    if (!isRecord(rawAttempt)) {
      return attempt;
    }

    return {
      attemptId: toText(rawAttempt.attemptId, attempt.attemptId),
      quizId: toText(rawAttempt.quizId, attempt.quizId),
      quizTitle: toText(rawAttempt.quizTitle, attempt.quizTitle),
      difficulty: toText(rawAttempt.difficulty, attempt.difficulty),
      score: toNonNegativeInteger(rawAttempt.score, attempt.score),
      totalQuestions: toNonNegativeInteger(
        rawAttempt.totalQuestions,
        attempt.totalQuestions,
      ),
      correctAnswers: toNonNegativeInteger(
        rawAttempt.correctAnswers,
        attempt.correctAnswers,
      ),
      percentage: toPercentage(rawAttempt.percentage, attempt.percentage),
      submittedAt:
        parseDateValue(rawAttempt.submittedAt, attempt.submittedAt) ||
        attempt.submittedAt,
      insight: normalizeAttemptInsight(rawAttempt.insight, attempt.insight),
    };
  });
}

function normalizeStudySessionReport(
  value: unknown,
  fallback: StudySessionReport,
): StudySessionReport {
  const report = isRecord(value) ? value : {};
  const session = isRecord(report.session) ? report.session : {};
  const activity = isRecord(report.activity) ? report.activity : {};
  const distractions = isRecord(report.distractions) ? report.distractions : {};
  const quiz = isRecord(report.quiz) ? report.quiz : {};
  const improvement = isRecord(report.improvement) ? report.improvement : {};
  const emailDelivery = isRecord(report.emailDelivery)
    ? report.emailDelivery
    : {};
  const rawFocusBand = toText(
    improvement.focusBand,
    fallback.improvement.focusBand,
  );
  const focusBand: StudySessionFocusBand = [
    "excellent",
    "good",
    "fair",
    "low",
  ].includes(rawFocusBand)
    ? (rawFocusBand as StudySessionFocusBand)
    : fallback.improvement.focusBand;

  return {
    session: {
      id: toText(session.id, fallback.session.id),
      userId: toText(session.userId, fallback.session.userId),
      fileId: toText(session.fileId, fallback.session.fileId),
      fileName: toText(session.fileName, fallback.session.fileName),
      status: toText(session.status, fallback.session.status),
      sessionStart:
        parseDateValue(session.sessionStart, fallback.session.sessionStart) ||
        fallback.session.sessionStart,
      sessionEnd: parseDateValue(session.sessionEnd, fallback.session.sessionEnd),
      totalDurationSeconds: toNonNegativeInteger(
        session.totalDurationSeconds,
        fallback.session.totalDurationSeconds,
      ),
      focusTimeSeconds: toNonNegativeInteger(
        session.focusTimeSeconds,
        fallback.session.focusTimeSeconds,
      ),
      idleTimeSeconds: toNonNegativeInteger(
        session.idleTimeSeconds,
        fallback.session.idleTimeSeconds,
      ),
      distractionCount: toNonNegativeInteger(
        session.distractionCount,
        fallback.session.distractionCount,
      ),
      focusScore: toPercentage(session.focusScore, fallback.session.focusScore),
      distractionRatioPercentage: toPercentage(
        session.distractionRatioPercentage,
        fallback.session.distractionRatioPercentage,
      ),
      totalDurationLabel: toText(
        session.totalDurationLabel,
        fallback.session.totalDurationLabel,
      ),
      focusedDurationLabel: toText(
        session.focusedDurationLabel,
        fallback.session.focusedDurationLabel,
      ),
      idleDurationLabel: toText(
        session.idleDurationLabel,
        fallback.session.idleDurationLabel,
      ),
    },
    activity: {
      totalEvents: toNonNegativeInteger(
        activity.totalEvents,
        fallback.activity.totalEvents,
      ),
      breakdown: toCountRecord(activity.breakdown, fallback.activity.breakdown),
    },
    distractions: {
      totalEvents: toNonNegativeInteger(
        distractions.totalEvents,
        fallback.distractions.totalEvents,
      ),
      totalDurationSeconds: toNonNegativeInteger(
        distractions.totalDurationSeconds,
        fallback.distractions.totalDurationSeconds,
      ),
      breakdown: toCountRecord(
        distractions.breakdown,
        fallback.distractions.breakdown,
      ),
    },
    quiz: {
      attempted: toBoolean(quiz.attempted, fallback.quiz.attempted),
      totalAttempts: toNonNegativeInteger(
        quiz.totalAttempts,
        fallback.quiz.totalAttempts,
      ),
      averagePercentage: toPercentage(
        quiz.averagePercentage,
        fallback.quiz.averagePercentage,
      ),
      bestPercentage: toPercentage(
        quiz.bestPercentage,
        fallback.quiz.bestPercentage,
      ),
      weakAreas: toStringArray(quiz.weakAreas, fallback.quiz.weakAreas, 8),
      latestInsight: normalizeLatestInsight(
        quiz.latestInsight,
        fallback.quiz.latestInsight,
      ),
      attempts: normalizeQuizAttempts(quiz.attempts, fallback.quiz.attempts),
    },
    improvement: {
      summary: toText(improvement.summary, fallback.improvement.summary),
      focusBand,
      strengths: toStringArray(
        improvement.strengths,
        fallback.improvement.strengths,
        4,
      ),
      risks: toStringArray(improvement.risks, fallback.improvement.risks, 4),
      recommendations: toStringArray(
        improvement.recommendations,
        fallback.improvement.recommendations,
        6,
      ),
      nextSessionChecklist: toStringArray(
        improvement.nextSessionChecklist,
        fallback.improvement.nextSessionChecklist,
        5,
      ),
    },
    emailDelivery: {
      sentAt: parseDateValue(emailDelivery.sentAt, fallback.emailDelivery.sentAt),
      lastAttemptAt: parseDateValue(
        emailDelivery.lastAttemptAt,
        fallback.emailDelivery.lastAttemptAt,
      ),
      lastError: toOptionalText(
        emailDelivery.lastError,
        fallback.emailDelivery.lastError,
      ),
      sendCount: toNonNegativeInteger(
        emailDelivery.sendCount,
        fallback.emailDelivery.sendCount,
      ),
    },
  };
}

/**
 * Generate a summary using Groq API with streaming support
 */
export async function generateSummary(
  documentTitle: string,
  content: string,
  metadata?: any,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.DOCUMENT_SUMMARY.system,
        },
        {
          role: "user",
          content: PROMPTS.DOCUMENT_SUMMARY.user(
            documentTitle,
            content,
            metadata,
          ),
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent, factual summaries
      max_tokens: 4000,
      top_p: 0.9,
    });

    const summaryText = response.choices[0]?.message?.content;

    if (!summaryText) {
      throw new Error("No summary generated from AI");
    }

    return summaryText.trim();
  } catch (error: any) {
    console.error("[AIService] Summary generation failed:", error.message);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

/**
 * Synthesize multiple chunks into a single summary
 */
export async function synthesizeChunks(
  documentTitle: string,
  chunks: Array<{ content: string; page?: number; metadata?: any }>,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.CHUNK_SYNTHESIS.system,
        },
        {
          role: "user",
          content: PROMPTS.CHUNK_SYNTHESIS.user(documentTitle, chunks),
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      top_p: 0.9,
    });

    const summaryText = response.choices[0]?.message?.content;

    if (!summaryText) {
      throw new Error("No synthesis generated from AI");
    }

    return summaryText.trim();
  } catch (error: any) {
    console.error("[AIService] Chunk synthesis failed:", error.message);
    throw new Error(`Failed to synthesize chunks: ${error.message}`);
  }
}

/**
 * Extract key concepts from content
 */
export async function extractConcepts(content: string): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.CONCEPT_EXTRACTION.system,
        },
        {
          role: "user",
          content: PROMPTS.CONCEPT_EXTRACTION.user(content),
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      top_p: 0.9,
    });

    const concepts = response.choices[0]?.message?.content;

    if (!concepts) {
      throw new Error("No concepts extracted from AI");
    }

    return concepts.trim();
  } catch (error: any) {
    console.error("[AIService] Concept extraction failed:", error.message);
    throw new Error(`Failed to extract concepts: ${error.message}`);
  }
}

export async function generateStudySessionReport(
  payload: GenerateStudySessionReportInput,
): Promise<StudySessionReport> {
  const fallbackReport = buildFallbackStudySessionReport(payload);

  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.STUDY_SESSION_REPORT.system,
        },
        {
          role: "user",
          content: PROMPTS.STUDY_SESSION_REPORT.user(payload),
        },
      ],
      temperature: 0.2,
      max_tokens: 4000,
      top_p: 0.9,
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("No study session report generated from AI");
    }

    const parsed = parseJsonFromAi<unknown>(rawContent);
    return normalizeStudySessionReport(parsed, fallbackReport);
  } catch (error: any) {
    console.error(
      "[AIService] Study session report generation failed:",
      error.message,
    );
    return fallbackReport;
  }
}

/**
 * Count tokens in a text (approximate)
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}
