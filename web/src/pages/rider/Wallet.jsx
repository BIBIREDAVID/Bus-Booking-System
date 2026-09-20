import { useEffect, useState } from 'react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { ApiError, getWallet, initiateWalletTopup, simulatePayment } from '../../lib/api'

const TXN_STYLES = {
  fund: { sign: '+', tone: 'text-green-700' },
  refund: { sign: '+', tone: 'text-green-700' },
  debit: { sign: '-', tone: 'text-brand-700' },
}

const TXN_LABEL = {
  fund: 'Wallet Top-up',
  debit: 'Payment',
  refund: 'Refund',
}

function naira(n) {
  return `₦${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Wallet() {
  const [wallet, setWallet] = useState(null)
  const [page, setPage] = useState(1)
  const [transactions, setTransactions] = useState([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showTopUp, setShowTopUp] = useState(false)
  const [amount, setAmount] = useState('')
  const [provider, setProvider] = useState('paystack')
  const [submitting, setSubmitting] = useState(false)
  const [gatewayInfo, setGatewayInfo] = useState(null)

  function load(nextPage) {
    setLoading(true)
    setError(null)
    getWallet({ page: nextPage, limit: 10 })
      .then((data) => {
        setWallet(data)
        setTransactions((prev) => (nextPage === 1 ? data.transactions : [...prev, ...data.transactions]))
        setHasMore(data.hasMore)
        setPage(nextPage)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleTopUp(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await initiateWalletTopup(Number(amount), provider)
      setGatewayInfo(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSimulate() {
    setError(null)
    setSubmitting(true)
    try {
      await simulatePayment(gatewayInfo.reference, provider)
      setGatewayInfo(null)
      setShowTopUp(false)
      setAmount('')
      load(1)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card tone="brand">
        <p className="text-sm text-white/80">Wallet Balance</p>
        <p className="mt-1 text-3xl font-bold">{wallet ? naira(wallet.balance) : '—'}</p>
        <Button
          variant="light"
          radius="lg"
          className="mt-4 px-5 py-2 text-sm"
          onClick={() => {
            setShowTopUp((v) => !v)
            setGatewayInfo(null)
          }}
        >
          Top Up
        </Button>
      </Card>

      {showTopUp && (
        <Card>
          {gatewayInfo ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl text-brand-600">
                ⏳
              </div>
              <h3 className="mt-3 text-base font-bold text-ink-900">Pay {naira(gatewayInfo.amount)}</h3>
              <p className="mt-1 text-xs text-ink-500">
                In production you'd be sent to the gateway's hosted checkout now. Your wallet is credited once
                payment is confirmed via webhook.
              </p>
              {error && <p className="mt-2 text-sm text-brand-700">{error}</p>}
              <Button radius="lg" disabled={submitting} className="mt-4 w-full py-3" onClick={handleSimulate}>
                {submitting ? 'Simulating...' : 'Simulate Payment Success (dev)'}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleTopUp} className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-ink-900">Top up your wallet</h3>
              <input
                type="number"
                min="1"
                step="1"
                required
                placeholder="Amount (₦)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl border border-brand-100 px-4 py-3 text-sm outline-none focus:border-brand-400"
              />
              <div className="flex gap-2">
                {['paystack', 'squad'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold capitalize ${
                      provider === p ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-brand-100 text-ink-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {error && <p className="text-sm text-brand-700">{error}</p>}
              <Button type="submit" radius="lg" disabled={submitting} className="py-3">
                {submitting ? 'Starting...' : 'Continue'}
              </Button>
            </form>
          )}
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-bold text-ink-900">Transaction History</h3>
        {loading && transactions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">Loading...</p>
        ) : transactions.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No transactions yet.</p>
        ) : (
          <div className="mt-3 flex flex-col divide-y divide-brand-50">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{TXN_LABEL[t.type]}</p>
                  <p className="text-xs text-ink-500">{formatDate(t.createdAt)}</p>
                </div>
                <p className={`text-sm font-bold ${TXN_STYLES[t.type].tone}`}>
                  {TXN_STYLES[t.type].sign}
                  {naira(t.amount)}
                </p>
              </div>
            ))}
          </div>
        )}

        {hasMore && (
          <button
            type="button"
            disabled={loading}
            onClick={() => load(page + 1)}
            className="mt-3 w-full rounded-xl border border-brand-100 py-2 text-sm font-semibold text-brand-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        )}
      </Card>
    </div>
  )
}
