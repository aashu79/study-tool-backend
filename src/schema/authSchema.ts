import { body } from "express-validator";

export const registerSchema = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("full_name").notEmpty().withMessage("Full name is required"),
  body("educationLevel").notEmpty().withMessage("Education level is required"),
];

export const loginSchema = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

export const verifySchema = [
  body("email").isEmail().withMessage("Valid email is required"),
  body("otp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
];

export const resendOTPSchema = [
  body("email").isEmail().withMessage("Valid email is required"),
];
