import axios from "axios";
import OpenAI from "openai";
import { FlashcardType, Prisma } from "@prisma/client";
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

interface GeneratedFlashcardResponse {
  title?: string;
  description?: string;
  focusAreas?: unknown;
  cards?: Array<{
    front?: string;
    back?: string;
    hint?: string;
    topic?: string;
    type?: string;
    tags?: unknown;
  }>;
}

interface NormalizedFlashcard {
  front: string;
  back: string;
  hint: string | null;
  topic: string | null;
  type: FlashcardType;
  tags: string[];
}

export interface CreateFlashcardSetInput {
  title?: string;
  description?: string;
  numberOfCards?: number;
  focusAreas?: string[] | string;
  specialInstruction?: string;
  includeFormulas?: boolean;
  includeExamples?: boolean;
  useVectorSearch?: boolean;
  searchQuery?: string;
  chunkLimit?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function getUserId(user: any): string {
  return user?.id || user?.user_id;
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

function toStringArray(value: unknown): string[] {
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

  return [];
}

function stringArrayFromJson(value: Prisma.JsonValue | null | undefined): string[] {
  if (!value) return [];
  return toStringArray(value);
}

function resolveFlashcardType(rawType: string | undefined): FlashcardType {
  const normalized = (rawType || "").trim().toUpperCase();

  switch (normalized) {
    case "DEFINITION":
      return FlashcardType.DEFINITION;
    case "FORMULA":
      return FlashcardType.FORMULA;
    case "CONCEPT":
      return FlashcardType.CONCEPT;
    case "PROCESS":
      return FlashcardType.PROCESS;
    case "EXAMPLE":
      return FlashcardType.EXAMPLE;
    case "COMPARISON":
      return FlashcardType.COMPARISON;
    case "APPLICATION":
      return FlashcardType.APPLICATION;
    default:
      return FlashcardType.CONCEPT;
  }
}

function normalizeFlashcard(
  rawCard: NonNullable<GeneratedFlashcardResponse["cards"]>[number],
): NormalizedFlashcard | null {
  const front = String(rawCard.front || "").trim();
  const back = String(rawCard.back || "").trim();

  if (!front || !back) {
    return null;
  }

  const hint = rawCard.hint ? String(rawCard.hint).trim() : "";
  const topic = rawCard.topic ? String(rawCard.topic).trim() : "";

  return {
    front,
    back,
    hint: hint || null,
    topic: topic || null,
    type: resolveFlashcardType(rawCard.type),
    tags: toStringArray(rawCard.tags),
  };
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

async function getFlashcardSourceContent(
  fileId: string,
  searchQuery: string,
  chunkLimit: number,
  useVectorSearch: boolean,
) {
  if (useVectorSearch) {
    try {
      const chunks = await retrieveChunksFromWorker(
        fileId,
        searchQuery,
        chunkLimit,
      );
      if (chunks.length > 0) return chunks;
    } catch (error: any) {
      console.warn(
        "[FlashcardService] Vector retrieval failed, using DB chunks:",
        error.message,
      );
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

async function generateFlashcardsWithAi(input: {
  fileName: string;
  cardCount: number;
  focusAreas: string[];
  specialInstruction?: string;
  includeFormulas: boolean;
  includeExamples: boolean;
  content: string;
}) {
  const systemPrompt = `
You are an expert study coach who creates high-quality flashcards from academic material.
Return only valid JSON, with no markdown and no extra keys.
Generate exactly ${input.cardCount} flashcards.
Each flashcard must:
- Be atomic and test one idea only
- Be specific and unambiguous
- Be concise but content-rich
- Prioritize formulas, core concepts, definitions, and high-yield facts
- Include applied cards where possible (especially for science/math/engineering)

Card type must be one of:
DEFINITION, FORMULA, CONCEPT, PROCESS, EXAMPLE, COMPARISON, APPLICATION
`;

  const userPrompt = `
Create flashcards from this document.

Document name: ${input.fileName}
Number of cards: ${input.cardCount}
Focus areas: ${
    input.focusAreas.length > 0 ? input.focusAreas.join(", ") : "All important areas"
  }
Include formulas explicitly: ${input.includeFormulas ? "Yes" : "No"}
Include worked examples/application cards: ${input.includeExamples ? "Yes" : "No"}
Special instruction: ${input.specialInstruction || "None"}

Content:
${input.content}

Return JSON with this exact structure:
{
  "title": "Set title",
  "description": "Short description of what this set covers",
  "focusAreas": ["topic 1", "topic 2"],
  "cards": [
    {
      "front": "Question/prompt side",
      "back": "Answer/explanation side",
      "hint": "Optional hint",
      "topic": "Main topic for the card",
      "type": "FORMULA",
      "tags": ["tag1", "tag2"]
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
    temperature: 0.35,
    max_tokens: 4000,
    top_p: 0.9,
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error("AI did not return flashcard content");
  }

  const parsed = parseJsonFromAi<GeneratedFlashcardResponse>(rawContent);
  const rawCards = Array.isArray(parsed.cards) ? parsed.cards : [];
  const normalizedCards = rawCards
    .map((card) => normalizeFlashcard(card))
    .filter((card): card is NormalizedFlashcard => Boolean(card));

  if (normalizedCards.length < input.cardCount) {
    throw new Error("AI returned fewer valid flashcards than requested");
  }

  return {
    title: parsed.title?.trim() || "",
    description: parsed.description?.trim() || "",
    focusAreas: toStringArray(parsed.focusAreas),
    cards: normalizedCards.slice(0, input.cardCount),
  };
}

function mapFlashcardSetOutput<T extends {
  id: string;
  fileId: string;
  userId: string;
  title: string;
  description: string | null;
  focusAreas: Prisma.JsonValue | null;
  generationInstruction: string | null;
  cardCount: number;
  modelUsed: string;
  createdAt: Date;
  updatedAt: Date;
  file?: { id: string; filename: string; mimetype: string } | null;
  cards?: Array<{
    id: string;
    cardIndex: number;
    front: string;
    back: string;
    hint: string | null;
    topic: string | null;
    type: FlashcardType;
    tags: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}>(set: T) {
  return {
    id: set.id,
    fileId: set.fileId,
    userId: set.userId,
    title: set.title,
    description: set.description,
    focusAreas: stringArrayFromJson(set.focusAreas),
    generationInstruction: set.generationInstruction,
    cardCount: set.cardCount,
    modelUsed: set.modelUsed,
    createdAt: set.createdAt,
    updatedAt: set.updatedAt,
    file: set.file || undefined,
    cards: Array.isArray(set.cards)
      ? set.cards
          .sort((a, b) => a.cardIndex - b.cardIndex)
          .map((card) => ({
            id: card.id,
            cardIndex: card.cardIndex,
            front: card.front,
            back: card.back,
            hint: card.hint,
            topic: card.topic,
            type: card.type,
            tags: stringArrayFromJson(card.tags),
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          }))
      : undefined,
  };
}

export async function createFlashcardSetFromFile(
  fileId: string,
  authUser: any,
  input: CreateFlashcardSetInput,
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
      `File must be processed before flashcard generation. Current status: ${file.processingStatus}`,
    );
  }

  if (file.chunks.length === 0) {
    throw new Error("No processed chunks found for this file");
  }

  const cardCount = clamp(Number(input.numberOfCards || 20), 5, 100);
  const chunkLimit = clamp(Number(input.chunkLimit || Math.max(20, cardCount * 2)), 8, 120);
  const includeFormulas = input.includeFormulas ?? true;
  const includeExamples = input.includeExamples ?? true;
  const focusAreas = toStringArray(input.focusAreas);
  const useVectorSearch = input.useVectorSearch ?? true;

  const searchQuery =
    input.searchQuery ||
    [
      `Generate study flashcards from ${file.filename}`,
      focusAreas.length > 0 ? `Focus: ${focusAreas.join(", ")}` : "",
      includeFormulas ? "prioritize formulas and important points" : "",
      input.specialInstruction || "",
    ]
      .filter(Boolean)
      .join(". ");

  const chunks = await getFlashcardSourceContent(
    fileId,
    searchQuery,
    chunkLimit,
    useVectorSearch,
  );

  if (chunks.length === 0) {
    throw new Error("No content available to generate flashcards");
  }

  const combinedContent = chunks
    .map((chunk, index) => {
      const page =
        chunk.pageStart !== null ? `Page ${chunk.pageStart}` : "No page";
      return `[Chunk ${index + 1} - ${page}]\n${chunk.content}`;
    })
    .join("\n\n");

  const contentForAi =
    combinedContent.length > 45000
      ? combinedContent.slice(0, 45000)
      : combinedContent;

  const aiResult = await generateFlashcardsWithAi({
    fileName: file.filename,
    cardCount,
    focusAreas,
    specialInstruction: input.specialInstruction,
    includeFormulas,
    includeExamples,
    content: contentForAi,
  });

  const title =
    input.title?.trim() || aiResult.title || `Flashcards on ${file.filename}`;
  const description = input.description?.trim() || aiResult.description || null;
  const finalFocusAreas = focusAreas.length > 0 ? focusAreas : aiResult.focusAreas;

  const createdSet = await prisma.flashcardSet.create({
    data: {
      fileId,
      userId,
      title,
      description,
      focusAreas: finalFocusAreas as Prisma.JsonArray,
      generationInstruction: input.specialInstruction?.trim() || null,
      cardCount: aiResult.cards.length,
      modelUsed: GROQ_MODEL,
      cards: {
        create: aiResult.cards.map((card, index) => ({
          cardIndex: index + 1,
          front: card.front,
          back: card.back,
          hint: card.hint,
          topic: card.topic,
          type: card.type,
          tags: card.tags as Prisma.JsonArray,
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
      cards: {
        orderBy: { cardIndex: "asc" },
      },
    },
  });

  return mapFlashcardSetOutput(createdSet);
}

export async function getFlashcardSetById(setId: string, authUser: any) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const set = await prisma.flashcardSet.findUnique({
    where: { id: setId },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
      cards: {
        orderBy: { cardIndex: "asc" },
      },
    },
  });

  if (!set) {
    throw new Error("Flashcard set not found");
  }

  if (set.userId !== userId) {
    throw new Error("Unauthorized access to flashcard set");
  }

  return mapFlashcardSetOutput(set);
}

export async function listUserFlashcardSets(
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

  const where: Prisma.FlashcardSetWhereInput = {
    userId,
    ...(options?.fileId ? { fileId: options.fileId } : {}),
  };

  const [sets, total] = await Promise.all([
    prisma.flashcardSet.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
          },
        },
        _count: {
          select: {
            cards: true,
          },
        },
      },
    }),
    prisma.flashcardSet.count({ where }),
  ]);

  return {
    flashcardSets: sets.map((set) => ({
      ...mapFlashcardSetOutput(set),
      cardsCount: set._count.cards,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function listFileFlashcardSets(fileId: string, authUser: any) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!file) {
    throw new Error("File not found");
  }

  if (file.userId !== userId) {
    throw new Error("Unauthorized access to file");
  }

  const sets = await prisma.flashcardSet.findMany({
    where: { fileId, userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          cards: true,
        },
      },
    },
  });

  return sets.map((set) => ({
    ...mapFlashcardSetOutput(set),
    cardsCount: set._count.cards,
  }));
}

export async function updateFlashcardSetTitle(
  setId: string,
  authUser: any,
  title: string,
) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const trimmed = String(title || "").trim();
  if (!trimmed) {
    throw new Error("Title is required");
  }

  const existingSet = await prisma.flashcardSet.findUnique({
    where: { id: setId },
  });

  if (!existingSet) {
    throw new Error("Flashcard set not found");
  }

  if (existingSet.userId !== userId) {
    throw new Error("Unauthorized access to flashcard set");
  }

  const updatedSet = await prisma.flashcardSet.update({
    where: { id: setId },
    data: { title: trimmed },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimetype: true,
        },
      },
      cards: {
        orderBy: { cardIndex: "asc" },
      },
    },
  });

  return mapFlashcardSetOutput(updatedSet);
}

export async function deleteFlashcardSet(setId: string, authUser: any) {
  const userId = getUserId(authUser);
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const existingSet = await prisma.flashcardSet.findUnique({
    where: { id: setId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!existingSet) {
    throw new Error("Flashcard set not found");
  }

  if (existingSet.userId !== userId) {
    throw new Error("Unauthorized access to flashcard set");
  }

  await prisma.flashcardSet.delete({
    where: { id: setId },
  });

  return { id: setId, deleted: true };
}
