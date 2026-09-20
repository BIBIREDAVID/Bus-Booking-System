import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, payAtPark, payWithWallet, simulatePayment, topUpAndPay } from '../../lib/api'

function formatDeparture(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const METHODS = [
  { id: 'wallet', label: 'Pay with Wallet', description: 'Instant — deducted from your BookMyBus wallet balance.' },
  { id: 'squad', label: 'Top up with Squad', description: "Short on wallet balance? We'll top up the difference." },
  { id: 'paystack', label: 'Top up with Paystack', description: "Short on wallet balance? We'll top up the difference." },
  { id: 'pay_at_park', label: 'Pay at Park', description: 'Reserve now, pay in cash at the park before departure.' },
]

export default function Checkout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const holdId = searchParams.get('holdId')
  const fromName = searchParams.get('from')
  const toName = searchParams.get('to')
  const when = searchParams.get('when')
  const fare = searchParams.get('fare')
  const seatNumber = searchParams.get('seatNumber')
  const expiresAt = searchParams.get('expiresAt')

  const [selected, setSelected] = useState('wallet')
  const [error, setError] = useState(null)
  const [gatewayInfo, setGatewayInfo] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSimulate() {
    setError(null)
    setSubmitting(true)
    try {
      const { outcome, ticket } = await simulatePayment(gatewayInfo.reference, selected)
      if (outcome === 'booked' && ticket) {
        navigate(`/tickets/${ticket.bookingId}`, { replace: true })
        return
      }
      if (outcome === 'wallet-credited-only') {
        setError('Wallet was topped up, but the seat is no longer available — check your wallet balance and search again.')
        return
      }
      setError(`Unexpected outcome: ${outcome}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePay() {
    setError(null)
    setSubmitting(true)
    setGatewayInfo(null)
    try {
      if (selected === 'wallet') {
        const { ticket } = await payWithWallet(holdId)
        navigate(`/tickets/${ticket.bookingId}`, { replace: true })
        return
      }
      if (selected === 'pay_at_park') {
        const { ticket } = await payAtPark(holdId)
        navigate(`/tickets/${ticket.bookingId}`, { replace: true })
        return
      }
      // squad / paystack — initiates a gateway top-up for the shortfall.
      const result = await topUpAndPay(holdId, selected)
      setGatewayInfo(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (gatewayInfo) {
    return (
      <Card className="mx-auto max-w-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl text-brand-600">
          ⏳
        </div>
        <h2 className="mt-4 text-lg font-bold text-ink-900">Redirecting to pay ₦{gatewayInfo.shortfall}</h2>
        <p className="mt-2 text-sm text-ink-500">
          In production you'd be sent to the gateway's hosted checkout now. Your wallet is topped up and this seat
          booked automatically once payment is confirmed via webhook.
        </p>
        <p className="mt-3 break-all rounded-lg bg-brand-50 px-3 py-2 text-xs text-ink-500">
          {gatewayInfo.checkoutUrl}
        </p>

        {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

        <Button radius="lg" disabled={submitting} className="mt-6 w-full py-3" onClick={handleSimulate}>
          {submitting ? 'Simulating...' : 'Simulate Payment Success (dev)'}
        </Button>
        <Button
          variant="outline"
          radius="lg"
          className="mt-2 w-full py-3"
          onClick={() => navigate('/bookings')}
        >
          I'll Pay Later
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card tone="brand">
        <h2 className="text-lg font-bold">
          {fromName} → {toName}
        </h2>
        <p className="mt-1 text-xs text-white/80">{formatDeparture(when)}</p>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-white/80">Seat {seatNumber}</span>
          <span className="font-bold">₦{fare}</span>
        </div>
        {expiresAt && (
          <p className="mt-2 text-xs text-white/70">
            Hold expires at {new Date(expiresAt).toLocaleTimeString()} — complete payment before then.
          </p>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-bold text-ink-900">Payment Method</h3>
        <div className="mt-3 flex flex-col gap-2">
          {METHODS.map((method) => (
            <button
              key={method.id}
              type="button"
              onClick={() => setSelected(method.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                selected === method.id ? 'border-brand-600 bg-brand-50' : 'border-brand-100'
              }`}
            >
              <p className="text-sm font-semibold text-ink-900">{method.label}</p>
              <p className="mt-0.5 text-xs text-ink-500">{method.description}</p>
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

        <Button radius="lg" disabled={submitting} className="mt-4 w-full py-4" onClick={handlePay}>
          {submitting ? 'Processing...' : 'Make Payment'}
        </Button>
      </Card>
    </div>
  )
}
