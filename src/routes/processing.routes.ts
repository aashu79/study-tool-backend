import { Router } from "express";
import {
  triggerProcessing,
  getStatus,
  healthCheck,
  queueStats,
} from "../controllers/processingController";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @route   POST /api/processing/trigger/:fileId
 * @desc    Manually trigger file processing via worker API
 * @access  Private
 */
router.post("/trigger/:fileId", authenticateToken, triggerProcessing);

/**
 * @route   GET /api/processing/status/:fileId
 * @desc    Get processing status for a file
 * @access  Private
 */
router.get("/status/:fileId", authenticateToken, getStatus);

/**
 * @route   GET /api/processing/health
 * @desc    Check worker service health
 * @access  Private
 */
router.get("/health", authenticateToken, healthCheck);

/**
 * @route   GET /api/processing/queue/stats
 * @desc    Get queue statistics from worker
 * @access  Private
 */
router.get("/queue/stats", authenticateToken, queueStats);

export default router;
