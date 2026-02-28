import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prismaClient";
import { sendEmail } from "./mailerService";

const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const OTP_EXPIRY_MINUTES = 10;
const APP_NAME = process.env.APP_NAME || "Study Tool";

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildOtpEmailTemplate(input: {
  otp: string;
  isReset: boolean;
  expiresInMinutes: number;
}) {
  const purpose = input.isReset ? "Password Reset" : "Email Verification";
  const subject = input.isReset
    ? `${APP_NAME}: Reset Your Password`
    : `${APP_NAME}: Verify Your Email`;
  const helpText = input.isReset
    ? "Use this code to reset your password."
    : "Use this code to verify your account.";
  const warningText = input.isReset
    ? "If you did not request a password reset, you can safely ignore this email."
    : "If you did not create this account, you can safely ignore this email.";

  const text = [
    `${APP_NAME} - ${purpose}`,
    "",
    helpText,
    `Code: ${input.otp}`,
    `This code expires in ${input.expiresInMinutes} minutes.`,
    "",
    warningText,
  ].join("\n");

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_NAME} ${purpose}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f7fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5edf6;">
            <tr>
              <td style="padding:22px 26px;background:linear-gradient(140deg,#0f3c73,#1457a8);">
                <p style="margin:0;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#cfe4ff;">${APP_NAME}</p>
                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;color:#ffffff;">${purpose}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px;">
                <p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#1e293b;">${helpText}</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:#1e293b;">Enter this one-time code in the app:</p>
                <div style="margin:0 0 18px;padding:16px 18px;border:1px dashed #97bce8;border-radius:10px;background:#f7fbff;text-align:center;">
                  <span style="font-size:34px;letter-spacing:8px;font-weight:700;color:#0f3c73;">${input.otp}</span>
                </div>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.65;color:#334155;">This code expires in <strong>${input.expiresInMinutes} minutes</strong>.</p>
                <p style="margin:0;font-size:13px;line-height:1.65;color:#64748b;">${warningText}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 26px;background:#f8fbff;border-top:1px solid #e5edf6;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">For security, never share this code with anyone.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  return { subject, text, html };
}

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

export async function updateUserProfilePicture(userId: string, key: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { profilePicture: key },
  });
}

export async function generateAndSendOTP(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

  await prisma.oTP.upsert({
    where: { userId: user.id },
    update: { otp, expiresAt, attempts: 0, updatedAt: new Date() },
    create: { userId: user.id, otp, expiresAt },
  });

  await sendOTPEmail(email, otp, false);
}

export async function sendPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);

  await prisma.oTP.upsert({
    where: { userId: user.id },
    update: { otp, expiresAt, attempts: 0, updatedAt: new Date() },
    create: { userId: user.id, otp, expiresAt },
  });

  await sendOTPEmail(email, otp, true);
}

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
  void token;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");
  if (!otp) throw new Error("OTP required");

  const record = await prisma.oTP.findUnique({ where: { userId: user.id } });
  if (!record || record.otp !== otp || record.expiresAt < new Date()) {
    throw new Error("Invalid or expired OTP");
  }

  const password_hash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { password_hash } });
  await prisma.oTP.delete({ where: { userId: user.id } });
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

  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

async function sendOTPEmail(email: string, otp: string, isReset = false) {
  const template = buildOtpEmailTemplate({
    otp,
    isReset,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
