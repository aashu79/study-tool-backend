import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware";
import { getDashboardInsightsController } from "../controllers/dashboardController";

const router = Router();

/**
 * @route   GET /api/dashboard/insights
 * @desc    Get dashboard metrics for the authenticated user
 * @access  Private
 */
router.get("/insights", authenticateToken, getDashboardInsightsController);

export default router;
