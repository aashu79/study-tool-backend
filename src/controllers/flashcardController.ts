import { Request, Response } from "express";
import {
  createFlashcardSetFromFile,
  deleteFlashcardSet,
  getFlashcardSetById,
  listFileFlashcardSets,
  listUserFlashcardSets,
  updateFlashcardSetTitle,
} from "../services/flashcardService";

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

export async function createFlashcardSet(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const set = await createFlashcardSetFromFile(fileId, (req as any).user, {
      title: req.body?.title,
      description: req.body?.description,
      numberOfCards: req.body?.numberOfCards,
      focusAreas: req.body?.focusAreas,
      specialInstruction: req.body?.specialInstruction,
      includeFormulas:
        typeof req.body?.includeFormulas === "boolean"
          ? req.body?.includeFormulas
          : req.body?.includeFormulas !== "false",
      includeExamples:
        typeof req.body?.includeExamples === "boolean"
          ? req.body?.includeExamples
          : req.body?.includeExamples !== "false",
      useVectorSearch:
        typeof req.body?.useVectorSearch === "boolean"
          ? req.body?.useVectorSearch
          : req.body?.useVectorSearch !== "false",
      searchQuery: req.body?.searchQuery,
      chunkLimit: req.body?.chunkLimit,
    });

    return res.status(201).json({
      success: true,
      message: "Flashcard set generated successfully",
      data: set,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to generate flashcard set",
    });
  }
}

export async function listFlashcardSets(req: Request, res: Response) {
  try {
    const result = await listUserFlashcardSets((req as any).user, {
      page: req.query?.page ? Number(req.query.page) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
      fileId: req.query?.fileId ? String(req.query.fileId) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.flashcardSets,
      pagination: result.pagination,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get flashcard sets",
    });
  }
}

export async function listFileFlashcardSetsController(
  req: Request,
  res: Response,
) {
  try {
    const { fileId } = req.params;
    const sets = await listFileFlashcardSets(fileId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: sets,
      count: sets.length,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get file flashcard sets",
    });
  }
}

export async function getFlashcardSet(req: Request, res: Response) {
  try {
    const { setId } = req.params;
    const set = await getFlashcardSetById(setId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: set,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get flashcard set",
    });
  }
}

export async function renameFlashcardSet(req: Request, res: Response) {
  try {
    const { setId } = req.params;
    const title = req.body?.title;
    const updated = await updateFlashcardSetTitle(
      setId,
      (req as any).user,
      title,
    );

    return res.status(200).json({
      success: true,
      message: "Flashcard set title updated successfully",
      data: updated,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to update flashcard set title",
    });
  }
}

export async function deleteFlashcardSetController(req: Request, res: Response) {
  try {
    const { setId } = req.params;
    await deleteFlashcardSet(setId, (req as any).user);

    return res.status(200).json({
      success: true,
      message: "Flashcard set deleted successfully",
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to delete flashcard set",
    });
  }
}
