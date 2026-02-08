import { Router } from "express";
import {
  register,
  login,
  me,
  verify,
  resendOTP,
  forgotPassword,
  resetPassword,
} from "../controllers/authController";
import upload from "../middleware/multer.middleware";
import {
  registerValidator,
  loginValidator,
  verifyValidator,
  resendOTPValidator,
} from "../middleware/validators.middleware";
import { handleValidation } from "../middleware/handleValidation.middleware";
import { authenticateToken } from "../middleware/auth.middleware";

const router = Router();
router.post(
  "/register",
  upload.single("profilePicture"),
  registerValidator,
  handleValidation,
  register
);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify", verifyValidator, handleValidation, verify);
router.post("/resend-otp", resendOTPValidator, handleValidation, resendOTP);
router.post("/login", loginValidator, handleValidation, login);
router.get("/me", authenticateToken, me);

export default router;
