import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  createFlashcardSet,
  deleteFlashcardSetController,
  getFlashcardSet,
  listFileFlashcardSetsController,
  listFlashcardSets,
  renameFlashcardSet,
} from "../controllers/flashcardController";

const router = Router();

/**
 * @route   POST /api/flashcards/file/:fileId
 * @desc    Generate a new AI flashcard set from a processed file
 * @access  Private
 */
router.post("/file/:fileId", authenticateToken, createFlashcardSet);

/**
 * @route   GET /api/flashcards/file/:fileId
 * @desc    List all flashcard sets for a specific file
 * @access  Private
 */
router.get("/file/:fileId", authenticateToken, listFileFlashcardSetsController);

/**
 * @route   GET /api/flashcards
 * @desc    List flashcard sets for authenticated user
 * @access  Private
 */
router.get("/", authenticateToken, listFlashcardSets);

/**
 * @route   GET /api/flashcards/:setId
 * @desc    Get a flashcard set with all cards
 * @access  Private
 */
router.get("/:setId", authenticateToken, getFlashcardSet);

/**
 * @route   PATCH /api/flashcards/:setId
 * @desc    Rename a flashcard set
 * @access  Private
 */
router.patch("/:setId", authenticateToken, renameFlashcardSet);

/**
 * @route   DELETE /api/flashcards/:setId
 * @desc    Delete a flashcard set and its cards
 * @access  Private
 */
router.delete("/:setId", authenticateToken, deleteFlashcardSetController);

export default router;
