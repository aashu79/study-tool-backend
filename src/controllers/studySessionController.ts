import { Request, Response } from "express";
import {
  addDistractionEvent,
  addStudyEvent,
  createStudySession,
  endStudySession,
  getActiveStudySession,
  getStudySessionById,
  getStudySessionReport,
  listStudySessions,
} from "../services/studySessionService";

function statusCodeFromError(error: any): number {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("unauthorized")) return 401;
  if (message.includes("not found")) return 404;
  if (message.includes("already has an active session")) return 409;
  if (
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("must") ||
    message.includes("cannot")
  ) {
    return 400;
  }
  return 500;
}

export async function startStudySession(req: Request, res: Response) {
  try {
    const session = await createStudySession((req as any).user, {
      fileId: req.body?.fileId,
      sessionStart: req.body?.sessionStart,
      initialEventData: req.body?.initialEventData,
    });

    return res.status(201).json({
      success: true,
      message: "Study session started successfully",
      data: session,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to start study session",
    });
  }
}

export async function listStudySessionsController(req: Request, res: Response) {
  try {
    const result = await listStudySessions((req as any).user, {
      page: req.query?.page ? Number(req.query.page) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
      fileId: req.query?.fileId ? String(req.query.fileId) : undefined,
      status: req.query?.status ? String(req.query.status) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.sessions,
      pagination: result.pagination,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to list study sessions",
    });
  }
}

export async function getActiveStudySessionController(
  req: Request,
  res: Response,
) {
  try {
    const session = await getActiveStudySession(
      (req as any).user,
      req.query?.fileId ? String(req.query.fileId) : undefined,
    );

    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get active study session",
    });
  }
}

export async function getStudySessionController(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const session = await getStudySessionById(sessionId, (req as any).user, {
      includeEvents: req.query?.includeEvents === "true",
      includeDistractions: req.query?.includeDistractions === "true",
      includeQuizAttempts: req.query?.includeQuizAttempts === "true",
    });

    return res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get study session",
    });
  }
}

export async function logStudyEventController(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const event = await addStudyEvent(sessionId, (req as any).user, {
      eventType: req.body?.eventType,
      eventData: req.body?.eventData,
      timestamp: req.body?.timestamp,
    });

    return res.status(201).json({
      success: true,
      message: "Study event logged successfully",
      data: event,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to log study event",
    });
  }
}

export async function logDistractionEventController(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const result = await addDistractionEvent(sessionId, (req as any).user, {
      distractionType: req.body?.distractionType,
      durationSeconds: req.body?.durationSeconds,
      metadata: req.body?.metadata,
      timestamp: req.body?.timestamp,
    });

    return res.status(201).json({
      success: true,
      message: "Distraction event logged successfully",
      data: result,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to log distraction event",
    });
  }
}

export async function endStudySessionController(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const session = await endStudySession(sessionId, (req as any).user, {
      status: req.body?.status,
      sessionEnd: req.body?.sessionEnd,
      focusTimeSeconds: req.body?.focusTimeSeconds,
      idleTimeSeconds: req.body?.idleTimeSeconds,
    });

    return res.status(200).json({
      success: true,
      message: "Study session ended successfully",
      data: session,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to end study session",
    });
  }
}

export async function getStudySessionReportController(
  req: Request,
  res: Response,
) {
  try {
    const { sessionId } = req.params;
    const report = await getStudySessionReport(sessionId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get study session report",
    });
  }
}
