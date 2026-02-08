import axios from "axios";
import OpenAI from "openai";
import { Prisma, QuizDifficulty } from "@prisma/client";
import prisma from "../lib/prismaClient";

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || "http://localhost:8000";
const GROQ_MODEL = process.env.GROQ_MODEL_ID || "qwen/qwen3-32b";

const aiClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

interface RetrievedChunk {
  chunkId: string;
  content: string;
  pageStart: number | null;
}

interface GeneratedQuizQuestion {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation?: string;
}

interface GeneratedQuizResponse {
  title?: string;
  questions: Array<{
    questionText?: string;
    question?: string;
    options?: unknown;
    correctOptionIndex?: number;
    answerIndex?: number;
    explanation?: string;
  }>;
}

interface GeneratedInsightResponse {
  strengths?: string;
  weaknesses?: string;
  weakAreas?: unknown;
  detailedInsights?: string;
  recommendedActions?: string;
}

export interface CreateQuizInput {
  title?: string;
  numberOfQuestions?: number;
  difficulty?: string;
  specialInstruction?: string;
  searchQuery?: string;
  useVectorSearch?: boolean;
  chunkLimit?: number;
}

export interface QuizAnswerInput {
  questionId: string;
  selectedOptionIndex: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function resolveDifficulty(rawDifficulty?: string): QuizDifficulty {
  if (!rawDifficulty) return QuizDifficulty.MEDIUM;
  const normalized = rawDifficulty.trim().toLowerCase();

  if (normalized.includes("medium") && normalized.includes("hard")) {
    return QuizDifficulty.MIXED;
  }
  if (normalized === "easy") return QuizDifficulty.EASY;
  if (normalized === "medium") return QuizDifficulty.MEDIUM;
  if (normalized === "hard") return QuizDifficulty.HARD;
  if (normalized === "mixed") return QuizDifficulty.MIXED;
  return QuizDifficulty.MEDIUM;
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
      const extracted = payload.slice(start, end + 1);
      return JSON.parse(extracted) as T;
    }
    throw new Error("AI returned invalid JSON");
  }
}

function normalizeQuestion(
  rawQuestion: GeneratedQuizResponse["questions"][number],
): GeneratedQuizQuestion | null {
  const questionText = (rawQuestion.questionText || rawQuestion.question || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!questionText) return null;

  const rawOptions = Array.isArray(rawQuestion.options)
    ? rawQuestion.options
    : [];
  const options = rawOptions
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);

  if (options.length < 4) return null;

  const correctOptionIndex =
    typeof rawQuestion.correctOptionIndex === "number"
      ? rawQuestion.correctOptionIndex
      : rawQuestion.answerIndex;

  if (
    typeof correctOptionIndex !== "number" ||
    correctOptionIndex < 0 ||
    correctOptionIndex > 3
  ) {
    return null;
  }

  return {
    questionText,
    options: options.slice(0, 4),
    correctOptionIndex,
    explanation: rawQuestion.explanation?.trim() || undefined,
  };
}

function parseWeakAreas(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function optionsFromJson(jsonValue: Prisma.JsonValue): string[] {
  if (!Array.isArray(jsonValue)) return [];
  return jsonValue
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
}

async function retrieveChunksFromWorker(
  fileId: string,
  query: string,
  topK: number,
): Promise<RetrievedChunk[]> {
  const response: any = await axios.post(
    `${WORKER_BASE_URL}/retrieve`,
    { query, fileId, top_k: topK },
    { timeout: 30000 },
  );

  const hits = response?.data?.hits || [];
  return hits.map((hit: any) => ({
    chunkId: hit.chunkId,
    content: String(hit.content || ""),
    pageStart: hit.pageStart ?? null,
  }));
}

async function getQuizSourceContent(
  fileId: string,
  searchQuery: string,
  chunkLimit: number,
  useVectorSearch: boolean,
) {
  if (useVectorSearch) {
    try {
      const chunks = await retrieveChunksFromWorker(fileId, searchQuery, chunkLimit);
      if (chunks.length > 0) return chunks;
    } catch (error: any) {
      console.warn("[QuizService] Vector retrieval failed, using DB chunks:", error.message);
    }
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { fileId },
    orderBy: { chunkIndex: "asc" },
    take: chunkLimit,
    select: {
      id: true,
      content: true,
      pageStart: true,
    },
  });

  return chunks.map((chunk) => ({
    chunkId: chunk.id,
    content: chunk.content,
    pageStart: chunk.pageStart,
  }));
}

async function generateQuestionsWithAi(input: {
  fileName: string;
  questionCount: number;
  difficulty: QuizDifficulty;
  specialInstruction?: string;
  content: string;
}) {
  const systemPrompt = `
You are an expert quiz generation assistant.
Return only valid JSON with no markdown.
Generate exactly ${input.questionCount} multiple-choice questions.
Each question must have exactly 4 options.
Use 0-based indexing for correctOptionIndex.
Avoid ambiguous or trick questions unless explicitly requested.
`;

  const userPrompt = `
Create a quiz from this document.

Document name: ${input.fileName}
Difficulty: ${input.difficulty}
Number of questions: ${input.questionCount}
Special instruction: ${input.specialInstruction || "None"}

Content:
${input.content}

Output JSON format:
{
  "title": "Quiz title",
  "questions": [
    {
      "questionText": "question",
      "options": ["option 1", "option 2", "option 3", "option 4"],
      "correctOptionIndex": 0,
      "explanation": "short reason"
    }
  ]
}
`;

  const response = await aiClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 3500,
    top_p: 0.9,
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("AI did not return quiz content");
  }

  const parsed = parseJsonFromAi<GeneratedQuizResponse>(rawContent);
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error("AI quiz response has no questions");
  }

  const normalizedQuestions = parsed.questions
    .map((question) => normalizeQuestion(question))
    .filter((question): question is GeneratedQuizQuestion => Boolean(question));

  if (normalizedQuestions.length < input.questionCount) {
    throw new Error("AI returned fewer valid questions than requested");
  }

  return {
    title: parsed.title?.trim(),
    questions: normalizedQuestions.slice(0, input.questionCount),
  };
}

async function generateInsightsWithAi(input: {
  quizTitle: string;
  difficulty: QuizDifficulty;
  totalQuestions: number;
  correctAnswers: number;
  percentage: number;
  responses: Array<{
    questionText: string;
    isCorrect: boolean;
    selectedOption: string;
    correctOption: string;
    explanation?: string | null;
  }>;
}) {
  const systemPrompt = `
You are an expert academic coach.
Analyze quiz performance and provide detailed, actionable insights.
Return only valid JSON and no markdown.
`;

  const userPrompt = `
Analyze this quiz attempt:

Quiz title: ${input.quizTitle}
Difficulty: ${input.difficulty}
Score: ${input.correctAnswers}/${input.totalQuestions} (${input.percentage}%)

Responses:
${JSON.stringify(input.responses, null, 2)}

Return JSON with this exact shape:
{
  "strengths": "Detailed paragraph",
  "weaknesses": "Detailed paragraph",
  "weakAreas": ["topic 1", "topic 2"],
  "detailedInsights": "Comprehensive analysis with patterns and reasoning",
  "recommendedActions": "Detailed action plan for improvement"
}
`;

  const response = await aiClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 2500,
    top_p: 0.9,
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("AI did not return insights content");
  }

  const parsed = parseJsonFromAi<GeneratedInsightResponse>(rawContent);
  return {
    strengths:
      parsed.strengths?.trim() ||
      "You answered several questions correctly and showed understanding in parts of the material.",
    weaknesses:
      parsed.weaknesses?.trim() ||
      "Some incorrect answers suggest gaps in core concepts and careful reading of question details.",
    weakAreas: parseWeakAreas(parsed.weakAreas),
    detailedInsights:
      parsed.detailedInsights?.trim() ||
      "Performance indicates mixed conceptual clarity. Review incorrect questions and reinforce weak concepts with targeted practice.",
    recommendedActions:
      parsed.recommendedActions?.trim() ||
      "Re-study weak topics, create concise notes, and retake a focused quiz to measure improvement.",
  };
}

function getUserId(user: any): string {
  return user?.id || user?.user_id;
}

export async function createQuizFromFile(
  fileId: string,
  authUser: any,
  input: CreateQuizInput,
) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      chunks: {
        select: { id: true },
      },
    },
  });

  if (!file) {
    throw new Error("File not found");
  }

  if (file.userId !== userId) {
    throw new Error("Unauthorized access to file");
  }

  if (file.processingStatus !== "COMPLETED") {
    throw new Error(
      `File must be processed before quiz generation. Current status: ${file.processingStatus}`,
    );
  }

  if (file.chunks.length === 0) {
    throw new Error("No processed chunks found for this file");
  }

  const questionCount = clamp(Number(input.numberOfQuestions || 10), 1, 40);
  const difficulty = resolveDifficulty(input.difficulty);
  const chunkLimit = clamp(
    Number(input.chunkLimit || Math.max(20, questionCount * 3)),
    5,
    80,
  );
  const useVectorSearch = input.useVectorSearch ?? true;
  const searchQuery =
    input.searchQuery ||
    `${difficulty} level quiz questions from ${file.filename} ${input.specialInstruction || ""}`;

  const chunks = await getQuizSourceContent(
    fileId,
    searchQuery,
    chunkLimit,
    useVectorSearch,
  );

  if (chunks.length === 0) {
    throw new Error("No content available to generate quiz");
  }

  const combinedContent = chunks
    .map((chunk, index) => {
      const page = chunk.pageStart !== null ? `Page ${chunk.pageStart}` : "No page";
      return `[Chunk ${index + 1} - ${page}]\n${chunk.content}`;
    })
    .join("\n\n");

  const contentForAi =
    combinedContent.length > 30000
      ? combinedContent.slice(0, 30000)
      : combinedContent;

  const aiQuiz = await generateQuestionsWithAi({
    fileName: file.filename,
    questionCount,
    difficulty,
    specialInstruction: input.specialInstruction,
    content: contentForAi,
  });

  const quizTitle = input.title?.trim() || aiQuiz.title || `Quiz on ${file.filename}`;

  const quiz = await prisma.quiz.create({
    data: {
      fileId,
      userId,
      title: quizTitle,
      specialInstruction: input.specialInstruction?.trim() || null,
      difficulty,
      questionCount: aiQuiz.questions.length,
      modelUsed: GROQ_MODEL,
      questions: {
        create: aiQuiz.questions.map((question, index) => ({
          questionIndex: index + 1,
          questionText: question.questionText,
          options: question.options as Prisma.JsonArray,
          correctOptionIndex: question.correctOptionIndex,
          explanation: question.explanation || null,
        })),
      },
    },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
      questions: {
        orderBy: { questionIndex: "asc" },
      },
    },
  });

  return {
    ...quiz,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      questionIndex: question.questionIndex,
      questionText: question.questionText,
      options: optionsFromJson(question.options),
    })),
  };
}

export async function getUserQuizzes(
  authUser: any,
  options?: {
    page?: number;
    limit?: number;
    fileId?: string;
  },
) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const page = clamp(Number(options?.page || 1), 1, 1000);
  const limit = clamp(Number(options?.limit || 10), 1, 50);

  const where: Prisma.QuizWhereInput = {
    userId,
    ...(options?.fileId ? { fileId: options.fileId } : {}),
  };

  const [quizzes, total] = await Promise.all([
    prisma.quiz.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        file: {
          select: {
            id: true,
            filename: true,
          },
        },
        _count: {
          select: {
            questions: true,
            attempts: true,
          },
        },
      },
    }),
    prisma.quiz.count({ where }),
  ]);

  return {
    quizzes,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getQuizById(quizId: string, authUser: any) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
      questions: {
        orderBy: { questionIndex: "asc" },
      },
      _count: {
        select: {
          attempts: true,
        },
      },
    },
  });

  if (!quiz) {
    throw new Error("Quiz not found");
  }

  if (quiz.userId !== userId) {
    throw new Error("Unauthorized access to quiz");
  }

  return {
    ...quiz,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      questionIndex: question.questionIndex,
      questionText: question.questionText,
      options: optionsFromJson(question.options),
    })),
  };
}

export async function submitQuizResponses(
  quizId: string,
  authUser: any,
  answers: QuizAnswerInput[],
) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("Answers are required");
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { questionIndex: "asc" },
      },
    },
  });

  if (!quiz) {
    throw new Error("Quiz not found");
  }

  if (quiz.userId !== userId) {
    throw new Error("Unauthorized access to quiz");
  }

  if (answers.length !== quiz.questions.length) {
    throw new Error(
      `You must submit exactly ${quiz.questions.length} answers for this quiz`,
    );
  }

  const questionMap = new Map(quiz.questions.map((question) => [question.id, question]));
  const seenQuestionIds = new Set<string>();

  const evaluatedAnswers = answers.map((answer) => {
    if (!answer.questionId || typeof answer.selectedOptionIndex !== "number") {
      throw new Error("Each answer must contain questionId and selectedOptionIndex");
    }

    if (seenQuestionIds.has(answer.questionId)) {
      throw new Error("Duplicate answers found for a question");
    }
    seenQuestionIds.add(answer.questionId);

    const question = questionMap.get(answer.questionId);
    if (!question) {
      throw new Error(`Invalid questionId: ${answer.questionId}`);
    }

    const options = optionsFromJson(question.options);
    if (
      answer.selectedOptionIndex < 0 ||
      answer.selectedOptionIndex >= options.length
    ) {
      throw new Error(`Selected option out of range for question ${question.id}`);
    }

    return {
      question,
      selectedOptionIndex: answer.selectedOptionIndex,
      isCorrect: answer.selectedOptionIndex === question.correctOptionIndex,
      selectedOption: options[answer.selectedOptionIndex] || "",
      correctOption: options[question.correctOptionIndex] || "",
    };
  });

  if (seenQuestionIds.size !== quiz.questions.length) {
    throw new Error("Answers for one or more questions are missing");
  }

  const totalQuestions = quiz.questions.length;
  const correctAnswers = evaluatedAnswers.filter((answer) => answer.isCorrect).length;
  const score = correctAnswers;
  const percentage =
    totalQuestions === 0
      ? 0
      : Number(((correctAnswers / totalQuestions) * 100).toFixed(2));

  const attempt = await prisma.quizAttempt.create({
    data: {
      quizId,
      userId,
      score,
      totalQuestions,
      correctAnswers,
      percentage,
      answers: {
        create: evaluatedAnswers.map((answer) => ({
          questionId: answer.question.id,
          selectedOptionIndex: answer.selectedOptionIndex,
          isCorrect: answer.isCorrect,
        })),
      },
    },
    include: {
      answers: {
        include: {
          question: true,
        },
      },
    },
  });

  let generatedInsights;
  try {
    generatedInsights = await generateInsightsWithAi({
      quizTitle: quiz.title,
      difficulty: quiz.difficulty,
      totalQuestions,
      correctAnswers,
      percentage,
      responses: evaluatedAnswers.map((answer) => ({
        questionText: answer.question.questionText,
        isCorrect: answer.isCorrect,
        selectedOption: answer.selectedOption,
        correctOption: answer.correctOption,
        explanation: answer.question.explanation,
      })),
    });
  } catch (error: any) {
    console.error("[QuizService] Insight generation failed:", error.message);
    generatedInsights = {
      strengths:
        "You have shown partial understanding of the content with several correct responses.",
      weaknesses:
        "There are concept gaps in topics tied to incorrect responses.",
      weakAreas: [],
      detailedInsights:
        "Review each incorrect question and compare your selected options against the correct choices to identify misconceptions.",
      recommendedActions:
        "Revise weak topics, practice targeted questions, and attempt another quiz with similar difficulty.",
    };
  }

  const insight = await prisma.quizInsight.create({
    data: {
      attemptId: attempt.id,
      quizId,
      userId,
      strengths: generatedInsights.strengths,
      weaknesses: generatedInsights.weaknesses,
      weakAreas: generatedInsights.weakAreas as Prisma.JsonArray,
      detailedInsights: generatedInsights.detailedInsights,
      recommendedActions: generatedInsights.recommendedActions,
      modelUsed: GROQ_MODEL,
    },
  });

  return {
    attemptId: attempt.id,
    quizId,
    score,
    totalQuestions,
    correctAnswers,
    percentage,
    submittedAt: attempt.createdAt,
    answers: attempt.answers
      .sort((a, b) => a.question.questionIndex - b.question.questionIndex)
      .map((answer) => ({
        questionId: answer.questionId,
        questionIndex: answer.question.questionIndex,
        questionText: answer.question.questionText,
        options: optionsFromJson(answer.question.options),
        selectedOptionIndex: answer.selectedOptionIndex,
        selectedOption: optionsFromJson(answer.question.options)[
          answer.selectedOptionIndex
        ],
        correctOptionIndex: answer.question.correctOptionIndex,
        correctOption: optionsFromJson(answer.question.options)[
          answer.question.correctOptionIndex
        ],
        isCorrect: answer.isCorrect,
        explanation: answer.question.explanation,
      })),
    insights: {
      id: insight.id,
      strengths: insight.strengths,
      weaknesses: insight.weaknesses,
      weakAreas: parseWeakAreas(insight.weakAreas),
      detailedInsights: insight.detailedInsights,
      recommendedActions: insight.recommendedActions,
      modelUsed: insight.modelUsed,
      createdAt: insight.createdAt,
    },
  };
}

export async function getQuizAttemptById(attemptId: string, authUser: any) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: {
        select: {
          id: true,
          title: true,
          difficulty: true,
          fileId: true,
          createdAt: true,
        },
      },
      answers: {
        include: {
          question: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      insight: true,
    },
  });

  if (!attempt) {
    throw new Error("Quiz attempt not found");
  }

  if (attempt.userId !== userId) {
    throw new Error("Unauthorized access to quiz attempt");
  }

  return {
    id: attempt.id,
    quiz: attempt.quiz,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    correctAnswers: attempt.correctAnswers,
    percentage: attempt.percentage,
    submittedAt: attempt.createdAt,
    answers: attempt.answers
      .sort((a, b) => a.question.questionIndex - b.question.questionIndex)
      .map((answer) => ({
        questionId: answer.questionId,
        questionIndex: answer.question.questionIndex,
        questionText: answer.question.questionText,
        options: optionsFromJson(answer.question.options),
        selectedOptionIndex: answer.selectedOptionIndex,
        selectedOption: optionsFromJson(answer.question.options)[
          answer.selectedOptionIndex
        ],
        correctOptionIndex: answer.question.correctOptionIndex,
        correctOption: optionsFromJson(answer.question.options)[
          answer.question.correctOptionIndex
        ],
        isCorrect: answer.isCorrect,
        explanation: answer.question.explanation,
      })),
    insights: attempt.insight
      ? {
          id: attempt.insight.id,
          strengths: attempt.insight.strengths,
          weaknesses: attempt.insight.weaknesses,
          weakAreas: parseWeakAreas(attempt.insight.weakAreas),
          detailedInsights: attempt.insight.detailedInsights,
          recommendedActions: attempt.insight.recommendedActions,
          modelUsed: attempt.insight.modelUsed,
          createdAt: attempt.insight.createdAt,
        }
      : null,
  };
}

export async function getQuizAttempts(quizId: string, authUser: any) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: {
      id: true,
      userId: true,
      title: true,
    },
  });

  if (!quiz) {
    throw new Error("Quiz not found");
  }

  if (quiz.userId !== userId) {
    throw new Error("Unauthorized access to quiz");
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: { quizId, userId },
    orderBy: { createdAt: "desc" },
    include: {
      insight: {
        select: {
          id: true,
          weakAreas: true,
          createdAt: true,
        },
      },
    },
  });

  return attempts.map((attempt) => ({
    id: attempt.id,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    correctAnswers: attempt.correctAnswers,
    percentage: attempt.percentage,
    submittedAt: attempt.createdAt,
    hasInsights: Boolean(attempt.insight),
    weakAreas: attempt.insight ? parseWeakAreas(attempt.insight.weakAreas) : [],
  }));
}
