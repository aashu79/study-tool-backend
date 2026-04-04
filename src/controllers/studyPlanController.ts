import { Request, Response } from "express";
import {
  createStudyPlanFromFile,
  deleteStudyPlan,
  getStudyPlanById,
  listFileStudyPlans,
  listUserStudyPlans,
  updateStudyPlanTitle,
} from "../services/studyPlanService";

function statusCodeFromError(error: any): number {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("unauthorized")) return 401;
  if (message.includes("not found")) return 404;
  if (
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("must")
  ) {
    return 400;
  }
  return 500;
}

export async function createStudyPlan(req: Request, res: Response) {
  try {
    const { fileId } = req.params;
    const plan = await createStudyPlanFromFile(fileId, (req as any).user, {
      customTitle: req.body?.customTitle,
      objective: req.body?.objective,
      currentKnowledgeLevel: req.body?.currentKnowledgeLevel,
      targetTimelineDays: req.body?.targetTimelineDays,
      studyHoursPerWeek: req.body?.studyHoursPerWeek,
      dailyStudyMinutes: req.body?.dailyStudyMinutes,
      specialInstruction: req.body?.specialInstruction,
    });

    return res.status(201).json({
      success: true,
      message: "Study plan generated successfully",
      data: plan,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to generate study plan",
    });
  }
}

export async function listFileStudyPlansController(
  req: Request,
  res: Response,
) {
  try {
    const { fileId } = req.params;
    const plans = await listFileStudyPlans(fileId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: plans,
      count: plans.length,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to list study plans for file",
    });
  }
}

export async function getStudyPlanController(req: Request, res: Response) {
  try {
    const { planId } = req.params;
    const plan = await getStudyPlanById(planId, (req as any).user);

    return res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get study plan",
    });
  }
}

export async function listUserStudyPlansController(
  req: Request,
  res: Response,
) {
  try {
    const result = await listUserStudyPlans((req as any).user, {
      page: req.query?.page ? Number(req.query.page) : undefined,
      limit: req.query?.limit ? Number(req.query.limit) : undefined,
      fileId: req.query?.fileId ? String(req.query.fileId) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result.plans,
      pagination: result.pagination,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to list study plans",
    });
  }
}

export async function renameStudyPlanController(req: Request, res: Response) {
  try {
    const { planId } = req.params;
    const updated = await updateStudyPlanTitle(
      planId,
      (req as any).user,
      String(req.body?.title || ""),
    );

    return res.status(200).json({
      success: true,
      message: "Study plan updated successfully",
      data: updated,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to update study plan",
    });
  }
}

export async function deleteStudyPlanController(req: Request, res: Response) {
  try {
    const { planId } = req.params;
    const result = await deleteStudyPlan(planId, (req as any).user);

    return res.status(200).json({
      success: true,
      message: "Study plan deleted successfully",
      data: result,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to delete study plan",
    });
  }
}
