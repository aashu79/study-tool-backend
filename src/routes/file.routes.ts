import { Router } from "express";
import upload from "../middleware/multer.middleware";
import {
  uploadProfilePicture,
  uploadUserFile,
  getProfilePicture,
  getUserFile,
  getUserFileDownload,
  getAllUserFiles,
  deleteUserFileController,
} from "../controllers/fileController";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();

// Upload user file
router.post(
  "/upload",
  authenticateToken,
  upload.array("files", 10), // up to 10 files per request
  uploadUserFile,
);

// Get profile picture signed URL
router.get("/profile-picture", authenticateToken, getProfilePicture);

// Get user file signed URL
router.get("/file/:fileId", authenticateToken, getUserFile);

// Get user file download URL
router.get("/file/:fileId/download", authenticateToken, getUserFileDownload);

// Get all user files with filters
router.get("/files", authenticateToken, getAllUserFiles);

// Delete user file
router.delete("/file/:fileId", authenticateToken, deleteUserFileController);

export default router;
