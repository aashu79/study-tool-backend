import { Request, Response } from "express";
import * as authService from "../services/authService";
import { uploadProfileImage } from "../services/r2Service";

// Forgot Password: send reset link or OTP
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    await authService.sendPasswordReset(email);
    res.json({ message: "Password reset instructions sent to email" });
  } catch (err: any) {
    res
      .status(400)
      .json({ error: err.message || "Failed to send reset instructions" });
  }
}

// Reset Password: set new password using token or OTP
export async function resetPassword(req: Request, res: Response) {
  try {
    const { email, token, otp, newPassword } = req.body;
    if (!email || !newPassword || (!token && !otp)) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    await authService.resetPassword({ email, token, otp, newPassword });
    res.json({ message: "Password reset successful" });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to reset password" });
  }
}

export async function register(req: Request, res: Response) {
  try {
    const { email, password, full_name, educationLevel } = req.body;
    if (!email || !password || !full_name || !educationLevel) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    let profilePictureKey: string | undefined = undefined;
    if (req.file) {
      profilePictureKey = await uploadProfileImage(email, req.file); // use email as temp id, will update below
    }
    const user = await authService.registerUser({
      email,
      password,
      full_name,
      educationLevel,
      profilePicture: profilePictureKey,
    });
    // If profilePicture was uploaded, update with user.id as folder
    if (req.file && user && profilePictureKey) {
      const newKey = await uploadProfileImage(user.id, req.file);
      await authService.updateUserProfilePicture(user.id, newKey);
    }
    await authService.generateAndSendOTP(email);
    res.status(201).json({
      user_id: user.id,
      email: user.email,
      message: "Verification code sent to email",
    });
  } catch (err: any) {
    if (err.message === "Email already exists") {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "Registration failed" });
  }
}

export async function verify(req: Request, res: Response) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Missing email or OTP" });
    }
    await authService.verifyOTP(email, otp);
    res.json({ message: "Email verified successfully" });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Verification failed" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }
    const token = await authService.loginUser({ email, password });
    res.json({ token });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Login failed" });
  }
}

export async function resendOTP(req: Request, res: Response) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });
    await authService.generateAndSendOTP(email);
    res.json({ message: "OTP resent to email" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to resend OTP" });
  }
}

export async function me(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;

    if (!userId) return res.sendStatus(401);
    // You may want to move this to a service as well
    const user = await authService.getUserById(userId);
    if (!user) return res.sendStatus(401);
    res.json({
      user_id: user.id,
      email: user.email,
      full_name: user.full_name,
      educationLevel: user.educationLevel,
      created_at: user.created_at,
      last_login: user.last_login,
    });
  } catch (err: any) {
    console.log(err);
    res.status(400).json({ error: err.message || "Failed to fetch user" });
  }
}
