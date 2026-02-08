import { Request, Response } from "express";
import {
  triggerFileProcessing,
  getProcessingStatus,
  checkWorkerHealth,
  getQueueStats,
} from "../services/processingService";

/**
 * Manually trigger file processing
 */
export async function triggerProcessing(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    console.log(
      `[ProcessingController] Manual processing triggered for file: ${fileId}`,
    );

    const result = await triggerFileProcessing(fileId, userId);

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    console.error(
      "[ProcessingController] Processing trigger failed:",
      error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to trigger processing",
    });
  }
}

/**
 * Get processing status for a file
 */
export async function getStatus(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const status = await getProcessingStatus(fileId, userId);

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error("[ProcessingController] Get status failed:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to get processing status",
    });
  }
}

/**
 * Check worker health
 */
export async function healthCheck(req: Request, res: Response) {
  try {
    const health = await checkWorkerHealth();

    return res.status(health.available ? 200 : 503).json({
      success: health.available,
      data: health,
    });
  } catch (error: any) {
    console.error("[ProcessingController] Health check failed:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to check worker health",
    });
  }
}

/**
 * Get queue statistics
 */
export async function queueStats(req: Request, res: Response) {
  try {
    const stats = await getQueueStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error(
      "[ProcessingController] Get queue stats failed:",
      error.message,
    );
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to get queue statistics",
    });
  }
}
