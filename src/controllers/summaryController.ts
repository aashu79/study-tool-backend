import { Request, Response } from "express";
import {
  createFileSummary,
  getFileSummaries,
  getSummaryById,
  getUserSummaries,
  deleteSummary,
  updateSummaryTitle,
} from "../services/summaryService";

/**
 * Create a new summary for a file
 */
export async function createSummary(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      customTitle,
      chunkLimit = 20,
      useVectorSearch = true,
      searchQuery,
    } = req.body;

    console.log(`[SummaryController] Creating summary for file: ${fileId}`);

    const summary = await createFileSummary(fileId, userId, {
      customTitle,
      chunkLimit: parseInt(chunkLimit),
      useVectorSearch: Boolean(useVectorSearch),
      searchQuery,
    });

    return res.status(201).json({
      success: true,
      message: "Summary created successfully",
      data: summary,
    });
  } catch (error: any) {
    console.error("[SummaryController] Create summary failed:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create summary",
    });
  }
}

/**
 * Get all summaries for a specific file
 */
export async function getFileSummariesController(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const summaries = await getFileSummaries(fileId, userId);

    return res.status(200).json({
      success: true,
      data: summaries,
      count: summaries.length,
    });
  } catch (error: any) {
    console.error(
      "[SummaryController] Get file summaries failed:",
      error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to get file summaries",
    });
  }
}

/**
 * Get a specific summary by ID
 */
export async function getSummary(req: Request, res: Response) {
  try {
    const { summaryId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const summary = await getSummaryById(summaryId, userId);

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error("[SummaryController] Get summary failed:", error.message);
    return res.status(404).json({
      success: false,
      error: error.message || "Summary not found",
    });
  }
}

/**
 * Get all summaries for the authenticated user
 */
export async function getUserSummariesController(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      page = "1",
      limit = "10",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const result = await getUserSummaries(userId, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sortBy: sortBy as "createdAt" | "wordCount",
      sortOrder: sortOrder as "asc" | "desc",
    });

    return res.status(200).json({
      success: true,
      data: result.summaries,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error: any) {
    console.error(
      "[SummaryController] Get user summaries failed:",
      error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to get user summaries",
    });
  }
}

/**
 * Delete a summary
 */
export async function deleteSummaryController(req: Request, res: Response) {
  try {
    const { summaryId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await deleteSummary(summaryId, userId);

    return res.status(200).json({
      success: true,
      message: "Summary deleted successfully",
    });
  } catch (error: any) {
    console.error("[SummaryController] Delete summary failed:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to delete summary",
    });
  }
}

/**
 * Update summary title
 */
export async function updateSummary(req: Request, res: Response) {
  try {
    const { summaryId } = req.params;
    const userId = (req as any).user?.id;
    const { title } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    const summary = await updateSummaryTitle(summaryId, userId, title);

    return res.status(200).json({
      success: true,
      message: "Summary updated successfully",
      data: summary,
    });
  } catch (error: any) {
    console.error("[SummaryController] Update summary failed:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update summary",
    });
  }
}
