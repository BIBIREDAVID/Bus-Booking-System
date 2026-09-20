import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import Card from '../../components/Card'
import PageHeader from '../../components/PageHeader'
import { EmptyState, LoadingState } from '../../components/EmptyState'
import { ApiError, listPaymentIntents, listWalletTransactions } from '../../lib/api'

const TXN_TYPE_STYLES = {
  fund: 'bg-green-50 text-green-700',
  debit: 'bg-brand-50 text-brand-700',
  refund: 'bg-blue-50 text-blue-700',
}

const INTENT_STATUS_STYLES = {
  pending: 'bg-yellow-50 text-yellow-700',
  succeeded: 'bg-green-50 text-green-700',
  failed: 'bg-ink-500/10 text-ink-500',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function WalletLedger() {
  const [txns, setTxns] = useState([])
  const [type, setType] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      listWalletTransactions({ type: type || undefined, phone: phone || undefined })
        .then(setTxns)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [type, phone])

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">Wallet ledger</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">All types</option>
            <option value="fund">Fund</option>
            <option value="debit">Debit</option>
            <option value="refund">Refund</option>
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : txns.length === 0 ? (
        <EmptyState icon={Wallet} message="No wallet transactions match these filters." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-xs uppercase tracking-wide text-ink-500">
                <th className="pb-2 pr-4">Rider</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Booking</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => (
                <tr key={t.id} className="border-b border-brand-50 last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-ink-900">{t.riderName ?? '—'}</p>
                    <p className="text-xs text-ink-500">{t.riderPhone}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${TXN_TYPE_STYLES[t.type]}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-semibold text-ink-900">
                    {t.type === 'debit' ? '-' : '+'}₦{t.amount}
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-500">
                    {t.bookingId ? t.bookingId.slice(0, 8).toUpperCase() : '—'}
                  </td>
                  <td className="py-3 text-xs text-ink-500">{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function GatewayPayments() {
  const [intents, setIntents] = useState([])
  const [status, setStatus] = useState('')
  const [provider, setProvider] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      listPaymentIntents({ status: status || undefined, provider: provider || undefined, phone: phone || undefined })
        .then(setIntents)
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [status, provider, phone])

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">Gateway payments (top-ups)</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">All providers</option>
            <option value="squad">Squad</option>
            <option value="paystack">Paystack</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-brand-100 px-3 py-2 text-xs outline-none focus:border-brand-400"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-brand-700">{error}</p>}

      {loading ? (
        <LoadingState />
      ) : intents.length === 0 ? (
        <EmptyState icon={Wallet} message="No gateway payments match these filters." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-brand-100 text-xs uppercase tracking-wide text-ink-500">
                <th className="pb-2 pr-4">Rider</th>
                <th className="pb-2 pr-4">Provider</th>
                <th className="pb-2 pr-4">Reference</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Initiated</th>
                <th className="pb-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((i) => (
                <tr key={i.id} className="border-b border-brand-50 last:border-0">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-ink-900">{i.riderName ?? '—'}</p>
                    <p className="text-xs text-ink-500">{i.riderPhone}</p>
                  </td>
                  <td className="py-3 pr-4 capitalize text-ink-700">{i.provider}</td>
                  <td className="py-3 pr-4 text-xs text-ink-500">{i.providerReference}</td>
                  <td className="py-3 pr-4 font-semibold text-ink-900">₦{i.amount}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${INTENT_STATUS_STYLES[i.status]}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-500">{formatDate(i.createdAt)}</td>
                  <td className="py-3 text-xs text-ink-500">{formatDate(i.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export default function Payments() {
  const [tab, setTab] = useState('ledger')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Wallet} title="Payments" description="Wallet ledger entries and gateway top-up attempts." />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('ledger')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'ledger' ? 'bg-brand-600 text-white' : 'bg-white text-ink-500'
          }`}
        >
          Wallet Ledger
        </button>
        <button
          type="button"
          onClick={() => setTab('gateway')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'gateway' ? 'bg-brand-600 text-white' : 'bg-white text-ink-500'
          }`}
        >
          Gateway Payments
        </button>
      </div>

      {tab === 'ledger' ? <WalletLedger /> : <GatewayPayments />}
    </div>
  )
}
