/**
 * Sends an email. Currently just logs to the console in development —
 * same stand-in pattern as lib/sms.ts.
 *
 * Plug in a real provider here later (SES, Postmark, Resend, etc.) —
 * swap the body of this function for an API call and nothing else in
 * the codebase needs to change.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('sendEmail: no email provider configured for production yet')
  }

  console.log(`[sendEmail] to=${to} subject="${subject}" body="${body}"`)
}
