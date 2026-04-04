import { processPendingStudySessionReportEmails } from "../services/studySessionReportEmailService";

let cronHandle: NodeJS.Timeout | null = null;
let isRunning = false;

function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number,
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

async function runStudySessionReportCronCycle() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const batchSize = parsePositiveInteger(
      process.env.STUDY_SESSION_REPORT_EMAIL_BATCH_SIZE,
      10,
    );
    const retryAfterMs = parsePositiveInteger(
      process.env.STUDY_SESSION_REPORT_EMAIL_RETRY_AFTER_MS,
      15 * 60 * 1000,
    );

    const result = await processPendingStudySessionReportEmails({
      limit: batchSize,
      retryAfterMs,
    });

    if (result.processed > 0) {
      console.log(
        `[StudySessionReportCron] processed=${result.processed} sent=${result.sent} failed=${result.failed}`,
      );
    }
  } catch (error: any) {
    console.error(
      "[StudySessionReportCron] Failed to process session report emails:",
      error?.message || error,
    );
  } finally {
    isRunning = false;
  }
}

export function startStudySessionReportCron() {
  const isEnabled = process.env.STUDY_SESSION_REPORT_EMAIL_ENABLED !== "false";
  if (!isEnabled || cronHandle) {
    return;
  }

  const intervalMs = parsePositiveInteger(
    process.env.STUDY_SESSION_REPORT_EMAIL_INTERVAL_MS,
    5 * 60 * 1000,
  );

  void runStudySessionReportCronCycle();
  cronHandle = setInterval(() => {
    void runStudySessionReportCronCycle();
  }, intervalMs);

  console.log(`[StudySessionReportCron] started with interval ${intervalMs}ms`);
}
