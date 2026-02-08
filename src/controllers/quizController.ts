import { Request, Response } from "express";
import {
  createQuizFromFile,
  getQuizAttemptById,
  getQuizAttempts,
  getQuizById,
  getUserQuizzes,
  submitQuizResponses,
} from "../services/quizService";

function statusCodeFromError(error: any): number {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("unauthorized")) return 401;
  if (message.includes("not found")) return 404;
  if (
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("must")
  ) {
    return 400;
  }
  return 500;
}

export async function createQuiz(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const quiz = await createQuizFromFile(fileId, (req as any).user, {
      title: req.body?.title,
      numberOfQuestions: req.body?.numberOfQuestions,
      difficulty: req.body?.difficulty,
      specialInstruction: req.body?.specialInstruction,
      searchQuery: req.body?.searchQuery,
      useVectorSearch:
        typeof req.body?.useVectorSearch === "boolean"
          ? req.body?.useVectorSearch
          : req.body?.useVectorSearch !== "false",
      chunkLimit: req.body?.chunkLimit,
    });

    return res.status(201).json({
      success: true,
      message: "Quiz generated successfully",
      data: quiz,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to generate quiz",
    });
  }
}

export async function listUserQuizzes(req: Request, res: Response) {
  try {
    const result = await getUserQuizzes((req as any).user, {
      page: req.query?.page ? Number(req.query.page) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
      fileId: req.query?.fileId ? String(req.query.fileId) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.quizzes,
      pagination: result.pagination,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get quizzes",
    });
  }
}

export async function getQuiz(req: Request, res: Response) {
  try {
    const { quizId } = req.params;
    const quiz = await getQuizById(quizId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: quiz,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get quiz",
    });
  }
}

export async function submitQuiz(req: Request, res: Response) {
  try {
    const { quizId } = req.params;
    const attempt = await submitQuizResponses(
      quizId,
      (req as any).user,
      req.body?.answers || [],
    );

    return res.status(201).json({
      success: true,
      message: "Quiz response recorded and insights generated",
      data: attempt,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to submit quiz responses",
    });
  }
}

export async function getQuizAttempt(req: Request, res: Response) {
  try {
    const { attemptId } = req.params;
    const attempt = await getQuizAttemptById(attemptId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: attempt,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get quiz attempt",
    });
  }
}

export async function listQuizAttempts(req: Request, res: Response) {
  try {
    const { quizId } = req.params;
    const attempts = await getQuizAttempts(quizId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: attempts,
      count: attempts.length,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get quiz attempts",
    });
  }
}
