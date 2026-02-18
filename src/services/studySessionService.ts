import {
  DistractionType,
  Prisma,
  StudyEventType,
  StudySessionStatus,
} from "@prisma/client";
import prisma from "../lib/prismaClient";

interface AuthUser {
  id?: string;
  user_id?: string;
}

interface CreateStudySessionInput {
  fileId: string;
  sessionStart?: string | Date;
  initialEventData?: Prisma.InputJsonValue;
}

interface LogStudyEventInput {
  eventType: string;
  eventData?: Prisma.InputJsonValue;
  timestamp?: string | Date;
}

interface LogDistractionInput {
  distractionType: string;
  durationSeconds?: number;
  metadata?: Prisma.InputJsonValue;
  timestamp?: string | Date;
}

interface EndStudySessionInput {
  status?: string;
  sessionEnd?: string | Date;
  focusTimeSeconds?: number;
  idleTimeSeconds?: number;
}

interface ListStudySessionInput {
  page?: number;
  limit?: number;
  fileId?: string;
  status?: string;
}

interface GetStudySessionOptions {
  includeEvents?: boolean;
  includeDistractions?: boolean;
  includeQuizAttempts?: boolean;
}

function getUserId(authUser: AuthUser | null | undefined): string {
  const userId = authUser?.id || authUser?.user_id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parseDateInput(
  value: unknown,
  fallback: Date,
  fieldName: string,
): Date {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return parsed;
}

function parseNonNegativeInteger(
  value: unknown,
  fieldName: string,
  fallback: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return parsed;
}

function parseEnumValue<T extends string>(
  value: unknown,
  enumValues: readonly T[],
  fieldName: string,
  fallback?: T,
): T {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${fieldName} is required`);
  }

  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  const matched = enumValues.find((item) => item.toUpperCase() === normalized);
  if (!matched) {
    throw new Error(
      `${fieldName} must be one of: ${enumValues.map((item) => String(item)).join(", ")}`,
    );
  }

  return matched;
}

function toDurationSeconds(start: Date, end: Date | null): number {
  if (!end) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
}

function buildSessionSummary(session: {
  sessionStart: Date;
  sessionEnd: Date | null;
  focusTimeSeconds: number;
  idleTimeSeconds: number;
  distractionCount: number;
  status: StudySessionStatus;
}) {
  const totalDurationSeconds = toDurationSeconds(
    session.sessionStart,
    session.sessionEnd,
  );
  const distractionRatioPercentage =
    totalDurationSeconds > 0
      ? Number(
          ((session.idleTimeSeconds / totalDurationSeconds) * 100).toFixed(2),
        )
      : 0;
  const focusScore =
    totalDurationSeconds > 0
      ? Number(
          (
            (Math.max(session.focusTimeSeconds, 0) / totalDurationSeconds) *
            100
          ).toFixed(2),
        )
      : session.status === StudySessionStatus.ACTIVE
        ? 0
        : 100;

  return {
    totalDurationSeconds,
    distractionRatioPercentage,
    focusScore: clamp(focusScore, 0, 100),
    distractionCount: session.distractionCount,
  };
}

async function ensureOwnedFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      userId: true,
      filename: true,
      processingStatus: true,
    },
  });

  if (!file) {
    throw new Error("File not found");
  }

  if (file.userId !== userId) {
    throw new Error("Unauthorized access to file");
  }

  return file;
}

async function ensureOwnedSession(sessionId: string, userId: string) {
  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("Study session not found");
  }

  if (session.userId !== userId) {
    throw new Error("Unauthorized access to study session");
  }

  return session;
}

export async function createStudySession(
  authUser: AuthUser,
  input: CreateStudySessionInput,
) {
  const userId = getUserId(authUser);

  if (!input.fileId) {
    throw new Error("fileId is required");
  }

  await ensureOwnedFile(input.fileId, userId);

  const existingActive = await prisma.studySession.findFirst({
    where: {
      userId,
      status: StudySessionStatus.ACTIVE,
    },
    select: {
      id: true,
      fileId: true,
    },
  });

  if (existingActive) {
    throw new Error(
      `User already has an active session (${existingActive.id}). End it before creating a new one.`,
    );
  }

  const sessionStart = parseDateInput(
    input.sessionStart,
    new Date(),
    "sessionStart",
  );

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.studySession.create({
      data: {
        userId,
        fileId: input.fileId,
        sessionStart,
        status: StudySessionStatus.ACTIVE,
      },
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
          },
        },
      },
    });

    await tx.studyEvent.create({
      data: {
        sessionId: createdSession.id,
        eventType: StudyEventType.SESSION_STARTED,
        timestamp: sessionStart,
        ...(input.initialEventData !== undefined
          ? { eventData: input.initialEventData }
          : {}),
      },
    });

    return createdSession;
  });

  return {
    ...session,
    summary: buildSessionSummary(session),
  };
}

export async function listStudySessions(
  authUser: AuthUser,
  options?: ListStudySessionInput,
) {
  const userId = getUserId(authUser);

  const page = clamp(Number(options?.page ?? 1), 1, 1000);
  const limit = clamp(Number(options?.limit ?? 10), 1, 50);

  const where: Prisma.StudySessionWhereInput = {
    userId,
  };

  if (options?.fileId) {
    where.fileId = options.fileId;
  }

  if (options?.status) {
    where.status = parseEnumValue(
      options.status,
      Object.values(StudySessionStatus),
      "status",
    );
  }

  const [sessions, total] = await Promise.all([
    prisma.studySession.findMany({
      where,
      orderBy: { sessionStart: "desc" },
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
            events: true,
            distractions: true,
            quizAttempts: true,
          },
        },
      },
    }),
    prisma.studySession.count({ where }),
  ]);

  return {
    sessions: sessions.map((session) => ({
      ...session,
      summary: buildSessionSummary(session),
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getActiveStudySession(
  authUser: AuthUser,
  fileId?: string,
) {
  const userId = getUserId(authUser);

  if (fileId) {
    await ensureOwnedFile(fileId, userId);
  }

  const session = await prisma.studySession.findFirst({
    where: {
      userId,
      status: StudySessionStatus.ACTIVE,
      ...(fileId ? { fileId } : {}),
    },
    orderBy: {
      sessionStart: "desc",
    },
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
          events: true,
          distractions: true,
          quizAttempts: true,
        },
      },
    },
  });

  if (!session) return null;

  return {
    ...session,
    summary: buildSessionSummary(session),
  };
}

export async function getStudySessionById(
  sessionId: string,
  authUser: AuthUser,
  options?: GetStudySessionOptions,
) {
  const userId = getUserId(authUser);
  const session = await ensureOwnedSession(sessionId, userId);

  let events: Awaited<ReturnType<typeof prisma.studyEvent.findMany>> | undefined;
  let distractions:
    | Awaited<ReturnType<typeof prisma.distractionEvent.findMany>>
    | undefined;
  let quizAttempts:
    | Awaited<ReturnType<typeof prisma.quizAttempt.findMany>>
    | undefined;

  if (options?.includeEvents) {
    events = await prisma.studyEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
    });
  }

  if (options?.includeDistractions) {
    distractions = await prisma.distractionEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
    });
  }

  if (options?.includeQuizAttempts) {
    quizAttempts = await prisma.quizAttempt.findMany({
      where: { sessionId, userId },
      orderBy: { createdAt: "desc" },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            difficulty: true,
          },
        },
      },
    });
  }

  return {
    ...session,
    summary: buildSessionSummary(session),
    ...(events ? { events } : {}),
    ...(distractions ? { distractions } : {}),
    ...(quizAttempts ? { quizAttempts } : {}),
  };
}

export async function addStudyEvent(
  sessionId: string,
  authUser: AuthUser,
  input: LogStudyEventInput,
) {
  const userId = getUserId(authUser);
  const session = await ensureOwnedSession(sessionId, userId);

  const eventType = parseEnumValue(
    input.eventType,
    Object.values(StudyEventType),
    "eventType",
  );

  if (
    session.status !== StudySessionStatus.ACTIVE &&
    eventType !== StudyEventType.SESSION_ENDED
  ) {
    throw new Error("Cannot log activity for a non-active session");
  }

  const timestamp = parseDateInput(input.timestamp, new Date(), "timestamp");

  const event = await prisma.studyEvent.create({
    data: {
      sessionId,
      eventType,
      timestamp,
      ...(input.eventData !== undefined ? { eventData: input.eventData } : {}),
    },
  });

  return event;
}

export async function addDistractionEvent(
  sessionId: string,
  authUser: AuthUser,
  input: LogDistractionInput,
) {
  const userId = getUserId(authUser);
  const session = await ensureOwnedSession(sessionId, userId);

  if (session.status !== StudySessionStatus.ACTIVE) {
    throw new Error("Cannot log distractions for a non-active session");
  }

  const distractionType = parseEnumValue(
    input.distractionType,
    Object.values(DistractionType),
    "distractionType",
  );
  const durationSeconds = parseNonNegativeInteger(
    input.durationSeconds,
    "durationSeconds",
    0,
  );
  const timestamp = parseDateInput(input.timestamp, new Date(), "timestamp");

  const result = await prisma.$transaction(async (tx) => {
    const distraction = await tx.distractionEvent.create({
      data: {
        sessionId,
        distractionType,
        durationSeconds,
        timestamp,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });

    const updatedSession = await tx.studySession.update({
      where: { id: sessionId },
      data: {
        distractionCount: { increment: 1 },
        idleTimeSeconds: { increment: durationSeconds },
      },
      select: {
        id: true,
        distractionCount: true,
        idleTimeSeconds: true,
        focusTimeSeconds: true,
      },
    });

    return { distraction, updatedSession };
  });

  return {
    event: result.distraction,
    sessionMetrics: result.updatedSession,
  };
}

export async function endStudySession(
  sessionId: string,
  authUser: AuthUser,
  input: EndStudySessionInput,
) {
  const userId = getUserId(authUser);
  const session = await ensureOwnedSession(sessionId, userId);

  const status = parseEnumValue(
    input.status,
    [StudySessionStatus.COMPLETED, StudySessionStatus.INCOMPLETE],
    "status",
    StudySessionStatus.COMPLETED,
  );
  const sessionEnd = parseDateInput(input.sessionEnd, new Date(), "sessionEnd");

  if (sessionEnd < session.sessionStart) {
    throw new Error("sessionEnd cannot be before sessionStart");
  }

  const totalDurationSeconds = toDurationSeconds(session.sessionStart, sessionEnd);
  const idleTimeSeconds = parseNonNegativeInteger(
    input.idleTimeSeconds,
    "idleTimeSeconds",
    session.idleTimeSeconds,
  );
  const focusTimeSeconds = parseNonNegativeInteger(
    input.focusTimeSeconds,
    "focusTimeSeconds",
    Math.max(0, totalDurationSeconds - idleTimeSeconds),
  );

  if (
    input.idleTimeSeconds !== undefined &&
    input.focusTimeSeconds !== undefined &&
    idleTimeSeconds + focusTimeSeconds > totalDurationSeconds
  ) {
    throw new Error("focusTimeSeconds + idleTimeSeconds cannot exceed session duration");
  }

  const updatedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.studySession.update({
      where: { id: sessionId },
      data: {
        sessionEnd,
        status,
        idleTimeSeconds,
        focusTimeSeconds,
      },
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            mimetype: true,
          },
        },
      },
    });

    await tx.studyEvent.create({
      data: {
        sessionId,
        eventType: StudyEventType.SESSION_ENDED,
        timestamp: sessionEnd,
        eventData: {
          status,
          focusTimeSeconds,
          idleTimeSeconds,
        },
      },
    });

    return updated;
  });

  return {
    ...updatedSession,
    summary: buildSessionSummary(updatedSession),
  };
}

export async function getStudySessionReport(
  sessionId: string,
  authUser: AuthUser,
) {
  const userId = getUserId(authUser);
  const session = await ensureOwnedSession(sessionId, userId);

  const [events, distractions, quizAttempts] = await Promise.all([
    prisma.studyEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
    }),
    prisma.distractionEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: "asc" },
    }),
    prisma.quizAttempt.findMany({
      where: { sessionId, userId },
      orderBy: { createdAt: "desc" },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            difficulty: true,
          },
        },
      },
    }),
  ]);

  const endedAt = session.sessionEnd ?? new Date();
  const totalDurationSeconds = toDurationSeconds(session.sessionStart, endedAt);
  const distractionDurationSeconds = distractions.reduce(
    (total, item) => total + item.durationSeconds,
    0,
  );
  const idleTimeSeconds = Math.max(session.idleTimeSeconds, distractionDurationSeconds);
  const focusTimeSeconds =
    session.focusTimeSeconds > 0
      ? session.focusTimeSeconds
      : Math.max(0, totalDurationSeconds - idleTimeSeconds);

  const distractionRatioPercentage =
    totalDurationSeconds > 0
      ? Number(((idleTimeSeconds / totalDurationSeconds) * 100).toFixed(2))
      : 0;
  const focusScore =
    totalDurationSeconds > 0
      ? Number(((focusTimeSeconds / totalDurationSeconds) * 100).toFixed(2))
      : 0;

  const eventBreakdown = events.reduce<Record<string, number>>((acc, item) => {
    acc[item.eventType] = (acc[item.eventType] || 0) + 1;
    return acc;
  }, {});

  const distractionBreakdown = distractions.reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.distractionType] = (acc[item.distractionType] || 0) + 1;
      return acc;
    },
    {},
  );

  const totalQuizAttempts = quizAttempts.length;
  const averageQuizPercentage =
    totalQuizAttempts > 0
      ? Number(
          (
            quizAttempts.reduce((sum, item) => sum + item.percentage, 0) /
            totalQuizAttempts
          ).toFixed(2),
        )
      : 0;
  const bestQuizPercentage =
    totalQuizAttempts > 0
      ? Number(
          Math.max(...quizAttempts.map((attempt) => attempt.percentage)).toFixed(2),
        )
      : 0;

  return {
    session: {
      id: session.id,
      userId: session.userId,
      fileId: session.fileId,
      fileName: session.file.filename,
      status: session.status,
      sessionStart: session.sessionStart,
      sessionEnd: session.sessionEnd,
      totalDurationSeconds,
      focusTimeSeconds,
      idleTimeSeconds,
      distractionCount: session.distractionCount,
      focusScore: clamp(focusScore, 0, 100),
      distractionRatioPercentage,
    },
    activity: {
      totalEvents: events.length,
      breakdown: eventBreakdown,
    },
    distractions: {
      totalEvents: distractions.length,
      totalDurationSeconds: distractionDurationSeconds,
      breakdown: distractionBreakdown,
    },
    quiz: {
      totalAttempts: totalQuizAttempts,
      averagePercentage: averageQuizPercentage,
      bestPercentage: bestQuizPercentage,
      attempts: quizAttempts.map((attempt) => ({
        attemptId: attempt.id,
        quizId: attempt.quizId,
        quizTitle: attempt.quiz.title,
        difficulty: attempt.quiz.difficulty,
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        correctAnswers: attempt.correctAnswers,
        percentage: attempt.percentage,
        submittedAt: attempt.createdAt,
      })),
    },
  };
}
