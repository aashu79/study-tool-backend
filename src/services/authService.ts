// Send password reset OTP or link
export async function sendPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");
  // For simplicity, reuse OTP logic for password reset
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
  await prisma.oTP.upsert({
    where: { id: user.id },
    update: { otp, expiresAt, attempts: 0, updatedAt: new Date() },
    create: { userId: user.id, otp, expiresAt },
  });
  await sendOTPEmail(email, otp, true);
}

// Reset password using OTP or token
export async function resetPassword({
  email,
  token,
  otp,
  newPassword,
}: {
  email: string;
  token?: string;
  otp?: string;
  newPassword: string;
}) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");
  // Only OTP supported here for simplicity
  if (!otp) throw new Error("OTP required");
  const record = await prisma.oTP.findUnique({ where: { id: user.id } });
  if (!record || record.otp !== otp || record.expiresAt < new Date()) {
    throw new Error("Invalid or expired OTP");
  }
  const password_hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password_hash } });
  await prisma.oTP.delete({ where: { id: user.id } });
}
export async function updateUserProfilePicture(userId: string, key: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { profilePicture: key },
  });
}
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import prisma from "../lib/prismaClient";

const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const OTP_EXPIRY_MINUTES = 10;

export async function getUserById(userId: string) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function registerUser({
  email,
  password,
  full_name,
  educationLevel,
}: any) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("Email already exists");
  const password_hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      full_name,
      educationLevel,
      isVerified: false,
    },
  });
  return user;
}

export async function generateAndSendOTP(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

  await prisma.oTP.upsert({
    where: { id: user.id },
    update: { otp, expiresAt, attempts: 0, updatedAt: new Date() },
    create: { userId: user.id, otp, expiresAt },
  });

  await sendOTPEmail(email, otp);
}

export async function verifyOTP(email: string, otp: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const record = await prisma.oTP.findUnique({
    where: { userId: user.id },
  });
  if (!record) throw new Error("No OTP found");
  if (record.otp !== otp) {
    await prisma.oTP.update({
      where: { userId: user.id },
      data: { attempts: record.attempts + 1 },
    });
    throw new Error("Invalid OTP");
  }
  if (record.expiresAt < new Date()) {
    throw new Error("OTP expired");
  }

  await prisma.user.update({ where: { email }, data: { isVerified: true } });
  await prisma.oTP.delete({ where: { userId: user.id } });
}

export async function loginUser({ email, password }: any) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");
  if (!(user as any).isVerified) throw new Error("Email not verified");
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid credentials");
  await prisma.user.update({
    where: { id: user.id },
    data: { last_login: new Date() },
  });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
  return token;
}

async function sendOTPEmail(email: string, otp: string, isReset = false) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.NODE_MAILER_EMAIL_ID,
      pass: process.env.NODE_MAILER_AUTH_PASS,
    },
  });
  await transporter.sendMail({
    from: process.env.NODE_MAILER_EMAIL_ID,
    to: email,
    subject: isReset ? "Password Reset Code" : "Your Verification Code",
    text: isReset
      ? `Your password reset code is: ${otp}`
      : `Your verification code is: ${otp}`,
  });
}
