import "dotenv/config";
import { z } from "zod";
import { sendEmail, usesMailCatcher } from "../src/lib/email";
import { getEnv } from "../src/lib/env";

const to = z.email().safeParse(process.argv[2]);
if (!to.success) {
  console.error("Usage: npm run email:test -- you@example.com");
  process.exit(1);
}

const env = getEnv();
const route = usesMailCatcher(to.data, env)
  ? `mail catcher (${env.MAIL_CATCHER_URL})`
  : `${env.SMTP_HOST}:${env.SMTP_PORT}`;

sendEmail({
  to: to.data,
  subject: "VenturePath test email",
  text: "If you can read this, VenturePath can send email.",
}).then(
  () => {
    console.log(`Sent to ${to.data} via ${route}.`);
    process.exit(0);
  },
  (err: Error) => {
    console.error(`Sending via ${route} failed: ${err.message}`);
    process.exit(1);
  },
);
