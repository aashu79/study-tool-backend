import { Router } from "express";
import {
  createSummary,
  getFileSummariesController,
  getSummary,
  getUserSummariesController,
  deleteSummaryController,
  updateSummary,
} from "../controllers/summaryController";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

/**
 * @route   POST /api/summary/file/:fileId
 * @desc    Create a new summary for a file
 * @access  Private
 * @body    { customTitle?, chunkLimit?, useVectorSearch?, searchQuery? }
 */
router.post("/file/:fileId", authenticateToken, createSummary);

/**
 * @route   GET /api/summary/file/:fileId
 * @desc    Get all summaries for a specific file
 * @access  Private
 */
router.get("/file/:fileId", authenticateToken, getFileSummariesController);

/**
 * @route   GET /api/summary/:summaryId
 * @desc    Get a specific summary by ID
 * @access  Private
 */
router.get("/:summaryId", authenticateToken, getSummary);

/**
 * @route   GET /api/summary
 * @desc    Get all summaries for the authenticated user
 * @access  Private
 * @query   { page?, limit?, sortBy?, sortOrder? }
 */
router.get("/", authenticateToken, getUserSummariesController);

/**
 * @route   DELETE /api/summary/:summaryId
 * @desc    Delete a summary
 * @access  Private
 */
router.delete("/:summaryId", authenticateToken, deleteSummaryController);

/**
 * @route   PATCH /api/summary/:summaryId
 * @desc    Update summary title
 * @access  Private
 * @body    { title }
 */
router.patch("/:summaryId", authenticateToken, updateSummary);

export default router;
