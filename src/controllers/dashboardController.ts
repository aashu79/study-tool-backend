import { Request, Response } from "express";
import { getDashboardInsights } from "../services/dashboardService";

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

function parseOptionalPositiveInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid query parameter: expected a positive integer");
  }

  return parsed;
}

export async function getDashboardInsightsController(
  req: Request,
  res: Response,
) {
  try {
    const result = await getDashboardInsights((req as any).user, {
      weeklyGoalTarget: parseOptionalPositiveInt(req.query?.weeklyGoalTarget),
      recentLimit: parseOptionalPositiveInt(req.query?.recentLimit),
      materialsLimit: parseOptionalPositiveInt(req.query?.materialsLimit),
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(statusCodeFromError(error)).json({
      success: false,
      error: error.message || "Failed to get dashboard insights",
    });
  }
}
