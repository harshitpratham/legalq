import { Resend } from "resend";

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const fromName = process.env.RESEND_FROM_NAME ?? "Pratham Legal";

  if (!apiKey || !fromEmail) {
    console.warn("Resend not configured (RESEND_API_KEY / RESEND_FROM_EMAIL missing)");
    return null;
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: params.to,
    subject: params.subject,
    text: params.body,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data ? { id: data.id } : null;
}
