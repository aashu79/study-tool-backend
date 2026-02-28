import nodemailer, { Transporter } from "nodemailer";

let cachedTransporter: Transporter | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getTransporter(): Transporter {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: getRequiredEnv("NODE_MAILER_EMAIL_ID"),
      pass: getRequiredEnv("NODE_MAILER_AUTH_PASS"),
    },
  });

  return cachedTransporter;
}

export function getDefaultSenderAddress(): string {
  return getRequiredEnv("NODE_MAILER_EMAIL_ID");
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}) {
  await getTransporter().sendMail({
    from: input.from || getDefaultSenderAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
