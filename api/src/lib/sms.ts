/**
 * Sends an SMS. Currently just logs to the console in development.
 *
 * Plug in a real provider here later (Termii, Africa's Talking, Twilio,
 * etc.) — swap the body of this function for an API call and nothing
 * else in the codebase needs to change.
 */
export async function sendSms(to: string, message: string): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('sendSms: no SMS provider configured for production yet')
  }

  console.log(`[sendSms] to=${to} message="${message}"`)
}
