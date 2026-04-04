import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  createStudyPlan,
  deleteStudyPlanController,
  getStudyPlanController,
  listFileStudyPlansController,
  listUserStudyPlansController,
  renameStudyPlanController,
} from "../controllers/studyPlanController";

const router = Router();

/**
 * @route   POST /api/study-plans/file/:fileId
 * @desc    Generate a new AI study plan for a processed file
 * @access  Private
 */
router.post("/file/:fileId", authenticateToken, createStudyPlan);

/**
 * @route   GET /api/study-plans/file/:fileId
 * @desc    List all study plans for a specific file
 * @access  Private
 */
router.get("/file/:fileId", authenticateToken, listFileStudyPlansController);

/**
 * @route   GET /api/study-plans
 * @desc    List study plans for the authenticated user
 * @access  Private
 */
router.get("/", authenticateToken, listUserStudyPlansController);

/**
 * @route   GET /api/study-plans/:planId
 * @desc    Get a specific study plan by ID
 * @access  Private
 */
router.get("/:planId", authenticateToken, getStudyPlanController);

/**
 * @route   PATCH /api/study-plans/:planId
 * @desc    Update study plan title
 * @access  Private
 */
router.patch("/:planId", authenticateToken, renameStudyPlanController);

/**
 * @route   DELETE /api/study-plans/:planId
 * @desc    Delete a study plan
 * @access  Private
 */
router.delete("/:planId", authenticateToken, deleteStudyPlanController);

export default router;
