import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getEnv, type Env } from "./env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

// Reserved by RFC 2606/6761; mail to them can never be delivered.
const RESERVED_DOMAIN_SUFFIXES = [".local", ".test", ".example", ".invalid"];

export function isReservedAddress(address: string): boolean {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  return RESERVED_DOMAIN_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export function smtpOptions(env: Env): SMTPTransport.Options {
  const auth =
    env.SMTP_USER && env.SMTP_PASSWORD
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined;
  const secure = env.SMTP_SECURE ?? env.SMTP_PORT === 465;
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    auth,
    // Never send credentials over an unencrypted connection.
    requireTLS: Boolean(auth) && !secure,
  };
}

/** Outside production, test addresses go to the local mail catcher even when real SMTP is set. */
export function usesMailCatcher(to: string, env: Env): boolean {
  return env.NODE_ENV !== "production" && isReservedAddress(to);
}

const globalForMailer = globalThis as unknown as { mailer?: Transporter; catcher?: Transporter };

function getMailer(to: string): Transporter {
  const env = getEnv();
  if (usesMailCatcher(to, env)) {
    globalForMailer.catcher ??= nodemailer.createTransport(env.MAIL_CATCHER_URL);
    return globalForMailer.catcher;
  }
  globalForMailer.mailer ??= nodemailer.createTransport(smtpOptions(env));
  return globalForMailer.mailer;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await getMailer(message.to).sendMail({ from: getEnv().EMAIL_FROM, ...message });
}
