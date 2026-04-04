import { Request, Response } from "express";
import {
  createDocumentChatThread,
  deleteDocumentChatThread,
  getDocumentChatMessages,
  listDocumentChatThreads,
  renameDocumentChatThread,
  sendDocumentChatMessage,
} from "../services/documentChatService";

function statusCodeFromError(error: any): number {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("unauthorized")) return 401;
  if (message.includes("not found")) return 404;
  if (
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("must") ||
    message.includes("does not belong")
  ) {
    return 400;
  }
  return 500;
}

export async function createDocumentChatThreadController(
  req: Request,
  res: Response,
) {
  try {
    const { fileId } = req.params;
    const thread = await createDocumentChatThread(fileId, (req as any).user, {
      title: req.body?.title,
    });

    return res.status(201).json({
      success: true,
      message: "Document chat thread created successfully",
      data: thread,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to create document chat thread",
    });
  }
}

export async function listDocumentChatThreadsController(
  req: Request,
  res: Response,
) {
  try {
    const { fileId } = req.params;
    const result = await listDocumentChatThreads(fileId, (req as any).user, {
      page: req.query?.page ? Number(req.query.page) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.threads,
      pagination: result.pagination,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to list document chat threads",
    });
  }
}

export async function getDocumentChatMessagesController(
  req: Request,
  res: Response,
) {
  try {
    const { threadId } = req.params;
    const result = await getDocumentChatMessages(threadId, (req as any).user, {
      page: req.query?.page ? Number(req.query.page) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.messages,
      thread: result.thread,
      pagination: result.pagination,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get document chat messages",
    });
  }
}

export async function sendDocumentChatMessageController(
  req: Request,
  res: Response,
) {
  try {
    const { fileId } = req.params;
    const result = await sendDocumentChatMessage(fileId, (req as any).user, {
      threadId: req.body?.threadId,
      message: req.body?.message,
      title: req.body?.title,
    });

    return res.status(201).json({
      success: true,
      message: "Document chat response generated successfully",
      data: result,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to generate document chat response",
    });
  }
}

export async function renameDocumentChatThreadController(
  req: Request,
  res: Response,
) {
  try {
    const { threadId } = req.params;
    const thread = await renameDocumentChatThread(
      threadId,
      (req as any).user,
      {
        title: req.body?.title,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Document chat thread updated successfully",
      data: thread,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to rename document chat thread",
    });
  }
}

export async function deleteDocumentChatThreadController(
  req: Request,
  res: Response,
) {
  try {
    const { threadId } = req.params;
    const result = await deleteDocumentChatThread(threadId, (req as any).user);

    return res.status(200).json({
      success: true,
      message: "Document chat thread deleted successfully",
      data: result,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to delete document chat thread",
    });
  }
}
