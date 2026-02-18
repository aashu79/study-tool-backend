import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  endStudySessionController,
  getActiveStudySessionController,
  getStudySessionController,
  getStudySessionReportController,
  listStudySessionsController,
  logDistractionEventController,
  logStudyEventController,
  startStudySession,
} from "../controllers/studySessionController";

const router = Router();

/**
 * @route   POST /api/study-sessions
 * @desc    Start a new study session for a file
 * @access  Private
 */
router.post("/", authenticateToken, startStudySession);

/**
 * @route   GET /api/study-sessions
 * @desc    List authenticated user's study sessions
 * @access  Private
 */
router.get("/", authenticateToken, listStudySessionsController);

/**
 * @route   GET /api/study-sessions/active
 * @desc    Get the currently active study session
 * @access  Private
 */
router.get("/active", authenticateToken, getActiveStudySessionController);

/**
 * @route   GET /api/study-sessions/:sessionId/report
 * @desc    Get analytics/report for a study session
 * @access  Private
 */
router.get(
  "/:sessionId/report",
  authenticateToken,
  getStudySessionReportController,
);

/**
 * @route   GET /api/study-sessions/:sessionId
 * @desc    Get a study session by ID (optional include flags via query params)
 * @access  Private
 */
router.get("/:sessionId", authenticateToken, getStudySessionController);

/**
 * @route   POST /api/study-sessions/:sessionId/events
 * @desc    Log a study activity event
 * @access  Private
 */
router.post("/:sessionId/events", authenticateToken, logStudyEventController);

/**
 * @route   POST /api/study-sessions/:sessionId/distractions
 * @desc    Log a distraction event
 * @access  Private
 */
router.post(
  "/:sessionId/distractions",
  authenticateToken,
  logDistractionEventController,
);

/**
 * @route   PATCH /api/study-sessions/:sessionId/end
 * @desc    End a study session
 * @access  Private
 */
router.patch("/:sessionId/end", authenticateToken, endStudySessionController);

export default router;
