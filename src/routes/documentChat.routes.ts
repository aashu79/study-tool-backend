import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import {
  createDocumentChatThreadController,
  deleteDocumentChatThreadController,
  getDocumentChatMessagesController,
  listDocumentChatThreadsController,
  renameDocumentChatThreadController,
  sendDocumentChatMessageController,
} from "../controllers/documentChatController";

const router = Router();

/**
 * @route   GET /api/document-chat/file/:fileId/threads
 * @desc    List saved chat threads for a specific document
 * @access  Private
 */
router.get(
  "/file/:fileId/threads",
  authenticateToken,
  listDocumentChatThreadsController,
);

/**
 * @route   POST /api/document-chat/file/:fileId/threads
 * @desc    Create an empty chat thread for a document
 * @access  Private
 */
router.post(
  "/file/:fileId/threads",
  authenticateToken,
  createDocumentChatThreadController,
);

/**
 * @route   POST /api/document-chat/file/:fileId/messages
 * @desc    Ask a question about a document and save the exchange
 * @access  Private
 */
router.post(
  "/file/:fileId/messages",
  authenticateToken,
  sendDocumentChatMessageController,
);

/**
 * @route   GET /api/document-chat/threads/:threadId/messages
 * @desc    Get paginated message history for a saved chat thread
 * @access  Private
 */
router.get(
  "/threads/:threadId/messages",
  authenticateToken,
  getDocumentChatMessagesController,
);

/**
 * @route   PATCH /api/document-chat/threads/:threadId
 * @desc    Rename a saved chat thread
 * @access  Private
 */
router.patch(
  "/threads/:threadId",
  authenticateToken,
  renameDocumentChatThreadController,
);

/**
 * @route   DELETE /api/document-chat/threads/:threadId
 * @desc    Delete a saved chat thread and all of its messages
 * @access  Private
 */
router.delete(
  "/threads/:threadId",
  authenticateToken,
  deleteDocumentChatThreadController,
);

export default router;
