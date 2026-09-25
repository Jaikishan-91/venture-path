import nodemailer, { type Transporter } from "nodemailer";
import { getEnv } from "./env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const globalForMailer = globalThis as unknown as { mailer?: Transporter };

function getMailer(): Transporter {
  const env = getEnv();
  globalForMailer.mailer ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });
  return globalForMailer.mailer;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getMailer().sendMail({ from: getEnv().EMAIL_FROM, ...message });
}
