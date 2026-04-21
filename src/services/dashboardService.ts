import { StudySessionStatus } from "@prisma/client";
import prisma from "../lib/prismaClient";

interface AuthUser {
  id?: string;
  user_id?: string;
}

interface DashboardInsightsOptions {
  weeklyGoalTarget?: number;
  recentLimit?: number;
  materialsLimit?: number;
}

type DashboardActivityType = "quiz" | "upload" | "study_session" | "flashcards";

interface DashboardActivityItem {
  id: string;
  type: DashboardActivityType;
  title: string;
  subtitle: string;
  createdAt: string;
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

function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const distanceFromMonday = (day + 6) % 7;
  const currentDayStart = startOfUtcDay(date);
  return addUtcDays(currentDayStart, -distanceFromMonday);
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function computeStudyStreak(sessionDates: Date[], now: Date): number {
  if (sessionDates.length === 0) return 0;

  const daySet = new Set(sessionDates.map((item) => utcDateKey(item)));
  const today = startOfUtcDay(now);
  const yesterday = addUtcDays(today, -1);

  let cursor: Date | null = null;
  if (daySet.has(utcDateKey(today))) {
    cursor = today;
  } else if (daySet.has(utcDateKey(yesterday))) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (cursor && daySet.has(utcDateKey(cursor))) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }

  return streak;
}

function greetingByHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes} min`;
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const decimalPlaces = value < 10 && index > 0 ? 1 : 0;
  return `${value.toFixed(decimalPlaces)} ${units[index]}`;
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

  return [];
}

export async function getDashboardInsights(
  authUser: AuthUser,
  options: DashboardInsightsOptions = {},
) {
  const userId = getUserId(authUser);
  const now = new Date();
  const startOfWeek = startOfUtcWeek(now);
  const startOfPreviousWeek = addUtcDays(startOfWeek, -7);
  const endOfWeek = addUtcDays(startOfWeek, 6);

  const weeklyGoalTarget = clamp(
    parsePositiveInt(
      options.weeklyGoalTarget,
      parsePositiveInt(process.env.DASHBOARD_WEEKLY_GOAL, 20),
    ),
    1,
    1000,
  );
  const recentLimit = clamp(parsePositiveInt(options.recentLimit, 6), 1, 20);
  const materialsLimit = clamp(
    parsePositiveInt(options.materialsLimit, 4),
    1,
    20,
  );

  const [
    user,
    totalUploads,
    uploadsThisWeek,
    pendingMaterials,
    activeFlashcardsAggregate,
    flashcardsThisWeekAggregate,
    quizzesTaken,
    quizzesThisWeek,
    completedFocusAverage,
    thisWeekFocusAverage,
    previousWeekFocusAverage,
    completedSessionsThisWeek,
    weakInsightRows,
    latestMaterialsRows,
    recentQuizAttempts,
    recentFileUploads,
    recentStudySessions,
    recentFlashcardSets,
    studySessionRows,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { full_name: true },
    }),
    prisma.file.count({ where: { userId } }),
    prisma.file.count({ where: { userId, createdAt: { gte: startOfWeek } } }),
    prisma.file.count({
      where: {
        userId,
        processingStatus: "COMPLETED",
        studySessions: { none: {} },
      },
    }),
    prisma.flashcardSet.aggregate({
      where: { userId },
      _sum: { cardCount: true },
    }),
    prisma.flashcardSet.aggregate({
      where: { userId, createdAt: { gte: startOfWeek } },
      _sum: { cardCount: true },
    }),
    prisma.quizAttempt.count({ where: { userId } }),
    prisma.quizAttempt.count({
      where: { userId, createdAt: { gte: startOfWeek } },
    }),
    prisma.studySession.aggregate({
      where: { userId, status: StudySessionStatus.COMPLETED },
      _avg: { focusTimeSeconds: true },
    }),
    prisma.studySession.aggregate({
      where: {
        userId,
        status: StudySessionStatus.COMPLETED,
        sessionStart: { gte: startOfWeek },
      },
      _avg: { focusTimeSeconds: true },
    }),
    prisma.studySession.aggregate({
      where: {
        userId,
        status: StudySessionStatus.COMPLETED,
        sessionStart: {
          gte: startOfPreviousWeek,
          lt: startOfWeek,
        },
      },
      _avg: { focusTimeSeconds: true },
    }),
    prisma.studySession.count({
      where: {
        userId,
        status: StudySessionStatus.COMPLETED,
        sessionStart: { gte: startOfWeek },
      },
    }),
    prisma.quizInsight.findMany({
      where: { userId },
      select: { weakAreas: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.file.findMany({
      where: { userId },
      select: {
        id: true,
        filename: true,
        size: true,
        processingStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: materialsLimit,
    }),
    prisma.quizAttempt.findMany({
      where: { userId },
      select: {
        id: true,
        percentage: true,
        createdAt: true,
        quiz: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: recentLimit * 3,
    }),
    prisma.file.findMany({
      where: { userId },
      select: {
        id: true,
        filename: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: recentLimit * 3,
    }),
    prisma.studySession.findMany({
      where: {
        userId,
        status: {
          in: [StudySessionStatus.COMPLETED, StudySessionStatus.INCOMPLETE],
        },
        sessionEnd: { not: null },
      },
      select: {
        id: true,
        status: true,
        sessionStart: true,
        sessionEnd: true,
        focusTimeSeconds: true,
        file: {
          select: {
            filename: true,
          },
        },
      },
      orderBy: { sessionEnd: "desc" },
      take: recentLimit * 3,
    }),
    prisma.flashcardSet.findMany({
      where: { userId },
      select: {
        id: true,
        title: true,
        cardCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: recentLimit * 3,
    }),
    prisma.studySession.findMany({
      where: { userId },
      select: { sessionStart: true },
      orderBy: { sessionStart: "desc" },
      take: 180,
    }),
  ]);

  const weakTopicCounter = new Map<string, { topic: string; count: number }>();
  for (const row of weakInsightRows) {
    const topics = parseStringList(row.weakAreas);
    for (const topic of topics) {
      const normalized = topic.toLowerCase();
      const entry = weakTopicCounter.get(normalized);
      if (entry) {
        entry.count += 1;
      } else {
        weakTopicCounter.set(normalized, { topic, count: 1 });
      }
    }
  }

  const weakTopics = Array.from(weakTopicCounter.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const activities: DashboardActivityItem[] = [
    ...recentQuizAttempts.map((attempt) => ({
      id: `quiz-${attempt.id}`,
      type: "quiz" as const,
      title: `Completed ${attempt.quiz.title}`,
      subtitle: `Score: ${Math.round(attempt.percentage)}%`,
      createdAt: attempt.createdAt.toISOString(),
    })),
    ...recentFileUploads.map((file) => ({
      id: `upload-${file.id}`,
      type: "upload" as const,
      title: "Uploaded new material",
      subtitle: file.filename,
      createdAt: file.createdAt.toISOString(),
    })),
    ...recentStudySessions.map((session) => ({
      id: `session-${session.id}`,
      type: "study_session" as const,
      title:
        session.status === StudySessionStatus.COMPLETED
          ? "Study session completed"
          : "Study session ended",
      subtitle: `${formatDuration(session.focusTimeSeconds)} focused on ${session.file.filename}`,
      createdAt: (session.sessionEnd || session.sessionStart).toISOString(),
    })),
    ...recentFlashcardSets.map((set) => ({
      id: `flashcards-${set.id}`,
      type: "flashcards" as const,
      title: "Created flashcard set",
      subtitle: `${set.title} (${set.cardCount} cards)`,
      createdAt: set.createdAt.toISOString(),
    })),
  ];

  const recentActivity = activities
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, recentLimit);

  const avgFocusSeconds = Number(
    completedFocusAverage._avg.focusTimeSeconds || 0,
  );
  const thisWeekAvgFocusSeconds = Number(
    thisWeekFocusAverage._avg.focusTimeSeconds || 0,
  );
  const previousWeekAvgFocusSeconds = Number(
    previousWeekFocusAverage._avg.focusTimeSeconds || 0,
  );

  const avgFocusTimeMinutes = Math.round(avgFocusSeconds / 60);
  const thisWeekFocusMinutes = Math.round(thisWeekAvgFocusSeconds / 60);
  const previousWeekFocusMinutes = Math.round(previousWeekAvgFocusSeconds / 60);

  const activeFlashcards = Number(
    activeFlashcardsAggregate._sum.cardCount || 0,
  );
  const flashcardsThisWeek = Number(
    flashcardsThisWeekAggregate._sum.cardCount || 0,
  );

  const firstName = String(user?.full_name || "Student")
    .trim()
    .split(/\s+/)[0];
  const streakDays = computeStudyStreak(
    studySessionRows.map((row) => row.sessionStart),
    now,
  );

  return {
    generatedAt: now.toISOString(),
    greeting: {
      message: `${greetingByHour(now.getHours())}, ${firstName}!`,
      pendingMaterials,
      streakDays,
    },
    weeklyGoal: {
      target: weeklyGoalTarget,
      completed: completedSessionsThisWeek,
      remaining: Math.max(0, weeklyGoalTarget - completedSessionsThisWeek),
      weekStart: startOfWeek.toISOString(),
      weekEnd: endOfWeek.toISOString(),
    },
    stats: {
      totalUploads,
      activeFlashcards,
      quizzesTaken,
      avgFocusTimeMinutes,
      weakTopicsCount: weakTopics.length,
      studyStreakDays: streakDays,
    },
    trends: {
      uploadsThisWeek,
      flashcardsThisWeek,
      quizzesThisWeek,
      avgFocusTimeMinutesDelta: thisWeekFocusMinutes - previousWeekFocusMinutes,
    },
    weakTopics,
    latestStudyMaterials: latestMaterialsRows.map((material) => ({
      id: material.id,
      filename: material.filename,
      sizeBytes: material.size,
      sizeLabel: formatFileSize(material.size),
      processingStatus: material.processingStatus,
      createdAt: material.createdAt.toISOString(),
    })),
    recentActivity,
  };
}
