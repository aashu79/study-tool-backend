import { Request, Response } from "express";
import {
  saveProfilePicture,
  saveUserFile,
  getProfilePictureUrl,
  getUserFileUrl,
  getUserFileDownloadUrl,
  getUserFiles,
  deleteUserFile,
} from "../services/fileService";
import redisClient from "../lib/redisClient";

export async function uploadProfilePicture(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const key = await saveProfilePicture(userId, req.file);
    res.json({ key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function uploadUserFile(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    const files = (req as any).files as Express.Multer.File[];
    if (!files || files.length === 0)
      return res.status(400).json({ error: "No files uploaded" });
    const results = await Promise.all(
      files.map((file) => saveUserFile(userId, file)),
    );

    // Add tasks to Redis queue for processing
    const queueName = "file_processing_queue";
    for (const file of results) {
      const task = {
        fileId: file.id,
        userId: file.userId,
        key: file.key,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
      };
      await redisClient.lPush(queueName, JSON.stringify(task));
    }

    res.json(results);
  } catch (err: any) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
}

export async function getProfilePicture(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    const url = await getProfilePictureUrl(userId);
    if (!url) return res.status(404).json({ error: "No profile picture" });
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getUserFile(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    const url = await getUserFileUrl(req.params.fileId, userId);
    if (!url) return res.status(404).json({ error: "File not found" });
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getUserFileDownload(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    const url = await getUserFileDownloadUrl(req.params.fileId, userId);
    if (!url) return res.status(404).json({ error: "File not found" });
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAllUserFiles(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    const { search, sortBy, sortOrder, fromDate, toDate, page, limit } =
      req.query;
    const filters = {
      search: search as string,
      sortBy: (sortBy as "createdAt") || "createdAt",
      sortOrder: (sortOrder as "asc" | "desc") || "desc",
      fromDate: fromDate ? new Date(fromDate as string) : undefined,
      toDate: toDate ? new Date(toDate as string) : undefined,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 10,
    };
    const result = await getUserFiles(userId, filters);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteUserFileController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.user_id || (req as any).user.id;
    await deleteUserFile(req.params.fileId, userId);
    res.json({ message: "File deleted successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
