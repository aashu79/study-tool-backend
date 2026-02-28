import { StudySessionStatus } from "@prisma/client";
import prisma from "../lib/prismaClient";
import { sendEmail } from "./mailerService";
import { getStudySessionReport } from "./studySessionService";

interface AuthUser {
  id?: string;
  user_id?: string;
}

interface SendStudySessionReportEmailOptions {
  force?: boolean;
  skipOwnershipCheck?: boolean;
}

const APP_NAME = process.env.APP_NAME || "Study Tool";

function getUserId(authUser: AuthUser | null | undefined): string {
  const userId = authUser?.id || authUser?.user_id;
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
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

function formatPercentage(value: number): string {
  return `${Number(value || 0).toFixed(2)}%`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBulletList(items: string[], accentColor: string) {
  if (items.length === 0) {
    return `<p style="margin:0;font-size:14px;line-height:1.7;color:#4b5563;">No additional notes for this section.</p>`;
  }

  return `
    <ul style="margin:0;padding:0 0 0 18px;color:#1f2937;">
      ${items
        .map(
          (item) => `
            <li style="margin:0 0 10px;font-size:14px;line-height:1.7;">
              <span style="color:${accentColor};">${escapeHtml(item)}</span>
            </li>`,
        )
        .join("")}
    </ul>
  `;
}

function buildStudySessionEmailTemplate(input: {
  userName: string;
  report: Awaited<ReturnType<typeof getStudySessionReport>>;
}) {
  const { userName, report } = input;
  const quizAttempted = report.quiz.attempted;
  const weakAreas = report.quiz.weakAreas.slice(0, 4);
  const latestActions = report.quiz.latestInsight?.recommendedActions || [];
  const emailTitle = quizAttempted
    ? "Your study session report is ready"
    : "Your study session summary is ready";
  const subject = quizAttempted
    ? `${APP_NAME}: Study session report with quiz insights`
    : `${APP_NAME}: Study session report and next-step guidance`;

  const quizSectionHtml = quizAttempted
    ? `
      <tr>
        <td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #dbe7f5;border-radius:18px;">
            <tr>
              <td style="padding:22px 24px;">
                <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">Quiz Performance</p>
                <h2 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">You attempted ${report.quiz.totalAttempts} quiz${report.quiz.totalAttempts === 1 ? "" : "zes"} in this session.</h2>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#475569;">Average score: <strong>${formatPercentage(report.quiz.averagePercentage)}</strong> | Best score: <strong>${formatPercentage(report.quiz.bestPercentage)}</strong></p>
                ${
                  weakAreas.length > 0
                    ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#1f2937;"><strong>Weak areas to revisit:</strong> ${escapeHtml(weakAreas.join(", "))}</p>`
                    : ""
                }
                ${
                  latestActions.length > 0
                    ? renderBulletList(latestActions.slice(0, 4), "#1d4ed8")
                    : `<p style="margin:0;font-size:14px;line-height:1.7;color:#4b5563;">Your quiz data did not include extra action notes, so rely on the session recommendations below.</p>`
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : `
      <tr>
        <td style="padding:0 28px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8e8;border:1px solid #f1d8a6;border-radius:18px;">
            <tr>
              <td style="padding:22px 24px;">
                <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;">Retention Check Missing</p>
                <h2 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#7c2d12;">No quiz was attempted in this session.</h2>
                <p style="margin:0;font-size:14px;line-height:1.7;color:#7c2d12;">You spent time studying, but recall was not tested. End the next session with a short quiz or self-test so you know what actually stuck.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

  const text = [
    `${APP_NAME} Study Session Report`,
    "",
    `Hi ${userName},`,
    report.improvement.summary,
    "",
    `Document: ${report.session.fileName}`,
    `Status: ${report.session.status}`,
    `Total study time: ${report.session.totalDurationLabel}`,
    `Focused time: ${report.session.focusedDurationLabel}`,
    `Idle time: ${report.session.idleDurationLabel}`,
    `Focus score: ${formatPercentage(report.session.focusScore)}`,
    `Distractions: ${report.session.distractionCount}`,
    quizAttempted
      ? `Quiz average: ${formatPercentage(report.quiz.averagePercentage)}`
      : "Quiz average: no quiz attempted",
    "",
    "Top recommendations:",
    ...report.improvement.recommendations.map((item) => `- ${item}`),
    "",
    "Next session checklist:",
    ...report.improvement.nextSessionChecklist.map((item) => `- ${item}`),
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#edf4fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:26px 12px;background:radial-gradient(circle at top,#dcecff 0%,#edf4fb 42%,#f7fafc 100%);">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#f8fbff;border-radius:24px;overflow:hidden;border:1px solid #d7e4f2;box-shadow:0 18px 40px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 52%,#38bdf8 100%);">
                <p style="margin:0;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#bfdbfe;">${APP_NAME}</p>
                <h1 style="margin:12px 0 10px;font-size:30px;line-height:1.2;color:#ffffff;">${escapeHtml(emailTitle)}</h1>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#dbeafe;">Hi ${escapeHtml(userName)}, ${escapeHtml(report.improvement.summary)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 12px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:0 8px 16px 0;width:33.33%;">
                      <div style="background:#ffffff;border:1px solid #dbe7f5;border-radius:18px;padding:18px;">
                        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Focus Score</p>
                        <p style="margin:0;font-size:28px;font-weight:700;color:#0f172a;">${formatPercentage(report.session.focusScore)}</p>
                      </div>
                    </td>
                    <td style="padding:0 8px 16px;width:33.33%;">
                      <div style="background:#ffffff;border:1px solid #dbe7f5;border-radius:18px;padding:18px;">
                        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Focused Time</p>
                        <p style="margin:0;font-size:28px;font-weight:700;color:#0f172a;">${escapeHtml(report.session.focusedDurationLabel)}</p>
                      </div>
                    </td>
                    <td style="padding:0 0 16px 8px;width:33.33%;">
                      <div style="background:#ffffff;border:1px solid #dbe7f5;border-radius:18px;padding:18px;">
                        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Distractions</p>
                        <p style="margin:0;font-size:28px;font-weight:700;color:#0f172a;">${report.session.distractionCount}</p>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #dbe7f5;border-radius:18px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;">Session Snapshot</p>
                      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a;">${escapeHtml(report.session.fileName)}</h2>
                      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#475569;">Status: <strong>${escapeHtml(report.session.status)}</strong></p>
                      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#475569;">Total study time: <strong>${escapeHtml(report.session.totalDurationLabel)}</strong></p>
                      <p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">Idle time share: <strong>${formatPercentage(report.session.distractionRatioPercentage)}</strong></p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${quizSectionHtml}
            <tr>
              <td style="padding:0 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #dbe7f5;border-radius:18px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#059669;">How To Improve</p>
                      <h2 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0f172a;">Recommendations for the next session</h2>
                      ${renderBulletList(report.improvement.recommendations, "#065f46")}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;border-radius:18px;">
                  <tr>
                    <td style="padding:22px 24px;">
                      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#93c5fd;">Next Session Checklist</p>
                      ${renderBulletList(report.improvement.nextSessionChecklist, "#dbeafe")}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#eff6ff;border-top:1px solid #d7e4f2;">
                <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">This report was generated from your study session activity, distraction events, and quiz attempts captured in ${APP_NAME}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export async function sendStudySessionReportEmail(
  sessionId: string,
  authUser?: AuthUser,
  options?: SendStudySessionReportEmailOptions,
) {
  const requesterId = options?.skipOwnershipCheck ? null : getUserId(authUser);

  const session = await prisma.studySession.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          full_name: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error("Study session not found");
  }

  if (requesterId && session.userId !== requesterId) {
    throw new Error("Unauthorized access to study session");
  }

  if (session.status === StudySessionStatus.ACTIVE) {
    throw new Error("Cannot send a report email for an active study session");
  }

  if (session.reportEmailSentAt && !options?.force) {
    return {
      sessionId: session.id,
      recipient: session.user.email,
      sentAt: session.reportEmailSentAt,
      alreadySent: true,
      sendCount: session.reportEmailSendCount,
    };
  }

  const attemptTime = new Date();

  await prisma.studySession.update({
    where: { id: sessionId },
    data: {
      reportEmailLastAttemptAt: attemptTime,
      reportEmailLastError: null,
    },
  });

  try {
    const report = await getStudySessionReport(sessionId, { id: session.userId });
    const template = buildStudySessionEmailTemplate({
      userName: session.user.full_name,
      report,
    });

    await sendEmail({
      to: session.user.email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    const sentAt = new Date();
    const updatedSession = await prisma.studySession.update({
      where: { id: sessionId },
      data: {
        reportEmailSentAt: sentAt,
        reportEmailLastAttemptAt: sentAt,
        reportEmailLastError: null,
        reportEmailSendCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
        reportEmailSendCount: true,
      },
    });

    return {
      sessionId: updatedSession.id,
      recipient: session.user.email,
      sentAt,
      alreadySent: false,
      sendCount: updatedSession.reportEmailSendCount,
      quizAttempted: report.quiz.attempted,
      totalQuizAttempts: report.quiz.totalAttempts,
      focusScore: report.session.focusScore,
    };
  } catch (error: any) {
    await prisma.studySession.update({
      where: { id: sessionId },
      data: {
        reportEmailLastAttemptAt: attemptTime,
        reportEmailLastError: String(
          error?.message || "Failed to send study session report email",
        ).slice(0, 2000),
      },
    });

    throw error;
  }
}

export async function processPendingStudySessionReportEmails(input?: {
  limit?: number;
  retryAfterMs?: number;
}) {
  const limit = Math.max(1, Math.min(Number(input?.limit || 10), 50));
  const retryAfterMs = Math.max(
    60000,
    Number(input?.retryAfterMs || 15 * 60 * 1000),
  );
  const retryBefore = new Date(Date.now() - retryAfterMs);

  const sessions = await prisma.studySession.findMany({
    where: {
      status: {
        in: [StudySessionStatus.COMPLETED, StudySessionStatus.INCOMPLETE],
      },
      reportEmailSentAt: null,
      OR: [
        { reportEmailLastAttemptAt: null },
        { reportEmailLastAttemptAt: { lte: retryBefore } },
      ],
    },
    select: {
      id: true,
    },
    orderBy: [{ sessionEnd: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  const results: Array<{
    sessionId: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const session of sessions) {
    try {
      await sendStudySessionReportEmail(session.id, undefined, {
        skipOwnershipCheck: true,
      });
      results.push({
        sessionId: session.id,
        success: true,
      });
    } catch (error: any) {
      results.push({
        sessionId: session.id,
        success: false,
        error: String(error?.message || "Failed to send report email"),
      });
    }
  }

  return {
    processed: sessions.length,
    sent: results.filter((item) => item.success).length,
    failed: results.filter((item) => !item.success).length,
    results,
  };
}
