import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  createQuiz,
  getQuiz,
  getQuizAttempt,
  listQuizAttempts,
  listUserQuizzes,
  submitQuiz,
} from "../controllers/quizController";

const router = Router();

/**
 * @route   POST /api/quiz/file/:fileId
 * @desc    Generate a new quiz from a processed file using AI
 * @access  Private
 */
router.post("/file/:fileId", authenticateToken, createQuiz);

/**
 * @route   GET /api/quiz
 * @desc    List quizzes for authenticated user
 * @access  Private
 */
router.get("/", authenticateToken, listUserQuizzes);

/**
 * @route   GET /api/quiz/attempt/:attemptId
 * @desc    Get a specific quiz attempt with insights
 * @access  Private
 */
router.get("/attempt/:attemptId", authenticateToken, getQuizAttempt);

/**
 * @route   GET /api/quiz/:quizId/attempts
 * @desc    List attempts for a quiz
 * @access  Private
 */
router.get("/:quizId/attempts", authenticateToken, listQuizAttempts);

/**
 * @route   GET /api/quiz/:quizId
 * @desc    Get quiz details and questions
 * @access  Private
 */
router.get("/:quizId", authenticateToken, getQuiz);

/**
 * @route   POST /api/quiz/:quizId/submit
 * @desc    Submit quiz answers and generate AI insights
 * @access  Private
 */
router.post("/:quizId/submit", authenticateToken, submitQuiz);

export default router;
