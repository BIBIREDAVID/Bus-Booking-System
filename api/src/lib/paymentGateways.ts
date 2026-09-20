import crypto from 'node:crypto'

export type GatewayProvider = 'squad' | 'paystack'

const SECRETS: Record<GatewayProvider, string | undefined> = {
  squad: process.env.SQUAD_SECRET_KEY,
  paystack: process.env.PAYSTACK_SECRET_KEY,
}

export interface InitializePaymentResult {
  reference: string
  checkoutUrl: string
}

/**
 * Stub — initiates a hosted-checkout payment with the given gateway.
 * Swap the body of this function for a real API call later (e.g.
 * `POST https://api.paystack.co/transaction/initialize`, or Squad's
 * equivalent) once real API keys are available. Same pattern as
 * lib/sms.ts: for now it just fabricates a reference and logs.
 */
export async function initializeGatewayPayment(
  provider: GatewayProvider,
  params: { amountNaira: number; email: string; metadata?: Record<string, unknown> },
): Promise<InitializePaymentResult> {
  const reference = `${provider}_${crypto.randomBytes(12).toString('hex')}`
  console.log(
    `[initializeGatewayPayment] provider=${provider} reference=${reference} amount=${params.amountNaira} email=${params.email}`,
  )
  return { reference, checkoutUrl: `https://checkout.example/${provider}/${reference}` }
}

/**
 * Verifies a webhook's signature so we never act on an unverified
 * payload. Both Squad and Paystack sign the raw request body with
 * HMAC-SHA512 using your secret key, sent back in a provider-specific
 * header — this matches their publicly documented scheme as of this
 * writing, but double-check against current provider docs before
 * going live (exact header name / algorithm can change):
 *   Paystack: header `x-paystack-signature`
 *   Squad:    header `x-squad-signature`
 *
 * Must be called with the raw (unparsed) request body — HMAC over a
 * re-serialized JSON object will not match, since key order/whitespace
 * can differ from what the gateway actually sent and signed.
 */
export function verifyWebhookSignature(
  provider: GatewayProvider,
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
): boolean {
  const secret = SECRETS[provider]
  if (!secret || !signatureHeader || Array.isArray(signatureHeader)) return false

  const expectedHex = crypto.createHmac('sha512', secret).update(rawBody).digest('hex')

  const expectedBuf = Buffer.from(expectedHex, 'utf8')
  const providedBuf = Buffer.from(signatureHeader, 'utf8')
  // Buffers must be equal length for timingSafeEqual, and a length
  // mismatch already means "not a match" — check first, don't throw.
  if (expectedBuf.length !== providedBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, providedBuf)
}
