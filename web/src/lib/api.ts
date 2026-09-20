const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

// Token storage: localStorage, not an httpOnly cookie.
//
// httpOnly cookies would be the more secure choice (immune to XSS
// reading the token directly), but they need the API and web app to
// share a domain/subdomain with HTTPS in production, and a dev proxy
// locally (this API runs on :4000, the web app on :5173 — different
// origins, so a cross-site cookie would need SameSite=None; Secure,
// which browsers won't send over plain http://localhost anyway).
// Revisit this once there's a real deployment domain to share.
//
// Tradeoff accepted for now: a successful XSS on this app can read
// these tokens. Mitigate by keeping the access token short-lived
// (15m) and the refresh token revocable server-side (see
// api/src/lib/refreshToken.ts) and rotated on every use.
const ACCESS_TOKEN_KEY = 'bookmybus_access_token'
const REFRESH_TOKEN_KEY = 'bookmybus_refresh_token'

export const tokenStorage = {
  getAccessToken: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefreshToken: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  setTokens: (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  },
  setAccessToken: (accessToken: string) => localStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Coalesces concurrent 401s into a single refresh call instead of each
// firing its own /auth/refresh request.
let refreshInFlight: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) return false

  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) {
          tokenStorage.clear()
          return false
        }
        const data = await res.json()
        tokenStorage.setTokens(data.accessToken, data.refreshToken)
        return true
      })
      .catch(() => {
        tokenStorage.clear()
        return false
      })
      .finally(() => {
        refreshInFlight = null
      })
  }

  return refreshInFlight
}

async function request<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const token = tokenStorage.getAccessToken()

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401 && !_retried && path !== '/auth/refresh') {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options, true)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(body.message ?? res.statusText, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export function health() {
  return api.get<{ status: string; time: string }>('/health')
}

// ------------------------------------------------------------
// Auth
// ------------------------------------------------------------

export interface PublicUser {
  id: string
  name: string | null
  phone: string
  role: 'rider' | 'park_staff' | 'admin'
  homeParkId: string | null
}

export function requestOtp(phone: string) {
  return api.post<{ message: string }>('/auth/request-otp', { phone })
}

export function verifyOtp(phone: string, code: string) {
  return api.post<{ accessToken: string; refreshToken: string; isNewUser: boolean; user: PublicUser }>(
    '/auth/verify-otp',
    { phone, code },
  )
}

export function getMe() {
  return api.get<PublicUser>('/auth/me')
}

export function updateMyName(name: string) {
  return api.patch<PublicUser>('/auth/me', { name })
}

export function logout() {
  const refreshToken = tokenStorage.getRefreshToken()
  return api.post<void>('/auth/logout', { refreshToken })
}

// ------------------------------------------------------------
// Admin
// ------------------------------------------------------------

export function promoteUser(payload: { phone: string; role: 'park_staff' | 'admin'; homeParkId?: string }) {
  return api.post<PublicUser>('/admin/users/promote', payload)
}

// ------------------------------------------------------------
// Admin — reference lookups
// ------------------------------------------------------------

export interface RouteOption {
  id: string
  label: string
  durationMins: number
}

export interface Bus {
  id: string
  plate: string
  capacity: number
  class: 'standard' | 'luxury' | 'vip'
  status: 'active' | 'maintenance'
}

export interface Driver {
  id: string
  name: string
  phone: string
  status: 'active' | 'inactive'
}

export function listRoutes() {
  return api.get<RouteOption[]>('/admin/routes')
}

export function listBuses() {
  return api.get<Bus[]>('/admin/buses')
}

export function listDrivers() {
  return api.get<Driver[]>('/admin/drivers')
}

// ------------------------------------------------------------
// Admin — route schedules
// ------------------------------------------------------------

export interface RouteSchedule {
  id: string
  routeId: string
  departureTime: string // "HH:mm"
  daysOfWeek: number[]
  active: boolean
  createdAt: string
}

export function listRouteSchedules() {
  return api.get<RouteSchedule[]>('/admin/route-schedules')
}

export function createRouteSchedule(payload: {
  routeId: string
  departureTime: string
  daysOfWeek: number[]
  active?: boolean
}) {
  return api.post<RouteSchedule>('/admin/route-schedules', payload)
}

export function updateRouteSchedule(id: string, payload: Partial<Omit<RouteSchedule, 'id' | 'createdAt'>>) {
  return api.patch<RouteSchedule>(`/admin/route-schedules/${id}`, payload)
}

export function deleteRouteSchedule(id: string) {
  return api.delete<void>(`/admin/route-schedules/${id}`)
}

// ------------------------------------------------------------
// Admin — trips
// ------------------------------------------------------------

export interface AdminTrip {
  id: string
  departureTime: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  routeLabel: string
  bus: Bus | null
  driver: Driver | null
  seatCount: number
}

export function listTrips(params?: { status?: AdminTrip['status']; routeId?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString()
  return api.get<AdminTrip[]>(`/admin/trips${qs ? `?${qs}` : ''}`)
}

export function assignTrip(id: string, payload: { busId: string; driverId?: string | null }) {
  return api.patch<AdminTrip>(`/admin/trips/${id}/assign`, payload)
}

export function cancelTrip(id: string) {
  return api.post<{ message: string; tripId: string; refundedBookingCount?: number }>(`/admin/trips/${id}/cancel`)
}

// ------------------------------------------------------------
// Rider — parks, search, seat map, holds
// ------------------------------------------------------------

export interface Park {
  id: string
  name: string
  city: string
  state: string
}

export function listParks() {
  return api.get<Park[]>('/parks')
}

export interface SearchResult {
  tripId: string
  departureTime: string
  boardStopId: string
  alightStopId: string
  originParkName: string
  destParkName: string
  bus: { plate: string; class: 'standard' | 'luxury' | 'vip'; capacity: number } | null
  fare: string | null
}

export function searchTrips(params: { originParkId: string; destParkId: string; date: string }) {
  const qs = new URLSearchParams(params).toString()
  return api.get<{ results: SearchResult[] }>(`/search?${qs}`)
}

export interface SeatAvailability {
  id: string
  seatNumber: string
  class: 'standard' | 'luxury' | 'vip'
  available: boolean
}

export function getSeatMap(tripId: string, boardStopId: string, alightStopId: string) {
  const qs = new URLSearchParams({ boardStopId, alightStopId }).toString()
  return api.get<{ seats: SeatAvailability[] }>(`/trips/${tripId}/seat-map?${qs}`)
}

export function holdSeat(payload: { tripId: string; seatId: string; boardStopId: string; alightStopId: string }) {
  return api.post<{ holdId: string; expiresAt: string }>('/bookings/hold', payload)
}

// ------------------------------------------------------------
// Checkout
// ------------------------------------------------------------

export interface Ticket {
  bookingId: string
  tripId: string
  status: 'held' | 'reserved_unpaid' | 'booked' | 'cancelled' | 'completed'
  paymentMethod: 'wallet' | 'squad' | 'paystack' | 'pay_at_park'
  amount: string
  seatNumber: string
  seatClass: 'standard' | 'luxury' | 'vip'
  boardParkName: string
  alightParkName: string
  departureTime: string
  busPlate: string | null
  payAtParkCutoff: string | null
  createdAt: string
  rating: { stars: number; comment: string | null } | null
}

export function payWithWallet(holdId: string) {
  return api.post<{ ticket: Ticket }>('/bookings/pay-with-wallet', { holdId })
}

export function payAtPark(holdId: string) {
  return api.post<{ ticket: Ticket }>('/bookings/pay-at-park', { holdId })
}

export function topUpAndPay(holdId: string, provider: 'squad' | 'paystack') {
  return api.post<{ reference: string; checkoutUrl: string; shortfall: number }>('/bookings/top-up-and-pay', {
    holdId,
    provider,
  })
}

// Dev-only: stands in for the gateway calling our webhook — see the
// route's doc comment in api/src/routes/bookings.ts. Not available
// when the API runs with NODE_ENV=production.
export function simulatePayment(reference: string, provider: 'squad' | 'paystack') {
  return api.post<{ outcome: string; ticket: Ticket | null }>('/bookings/simulate-payment', { reference, provider })
}

export function getBooking(bookingId: string) {
  return api.get<{ ticket: Ticket }>(`/bookings/${bookingId}`)
}

export function rateBooking(bookingId: string, payload: { stars: number; comment?: string }) {
  return api.post<{ ticket: Ticket }>(`/bookings/${bookingId}/rating`, payload)
}

export function listBookings() {
  return api.get<{ bookings: Ticket[] }>('/bookings')
}

export function cancelBooking(bookingId: string) {
  return api.post<{ ticket: Ticket; refunded: boolean }>(`/bookings/${bookingId}/cancel`)
}

export function rescheduleBooking(
  bookingId: string,
  payload: { tripId: string; seatId: string; boardStopId: string; alightStopId: string },
) {
  return api.post<{ ticket: Ticket }>(`/bookings/${bookingId}/reschedule`, payload)
}

// ------------------------------------------------------------
// Admin — bookings & payments
// ------------------------------------------------------------

export interface AdminBooking {
  id: string
  status: 'held' | 'reserved_unpaid' | 'booked' | 'cancelled' | 'completed'
  paymentMethod: 'wallet' | 'squad' | 'paystack' | 'pay_at_park'
  amount: string
  class: 'standard' | 'luxury' | 'vip'
  createdAt: string
  payAtParkCutoff: string | null
  riderPhone: string
  riderName: string | null
  seatNumber: string
  boardParkName: string
  alightParkName: string
  departureTime: string
  busPlate: string | null
}

export function listAdminBookings(params?: { status?: AdminBooking['status']; paymentMethod?: AdminBooking['paymentMethod']; phone?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<AdminBooking[]>(`/admin/bookings${qs ? `?${qs}` : ''}`)
}

export interface AdminWalletTransaction {
  id: string
  type: 'fund' | 'debit' | 'refund'
  amount: string
  bookingId: string | null
  riderPhone: string
  riderName: string | null
  createdAt: string
}

export function listWalletTransactions(params?: { type?: AdminWalletTransaction['type']; phone?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<AdminWalletTransaction[]>(`/admin/wallet-transactions${qs ? `?${qs}` : ''}`)
}

export interface AdminPaymentIntent {
  id: string
  provider: 'squad' | 'paystack'
  providerReference: string
  amount: string
  status: 'pending' | 'succeeded' | 'failed'
  bookingId: string | null
  riderPhone: string
  riderName: string | null
  createdAt: string
  completedAt: string | null
}

export function listPaymentIntents(params?: { status?: AdminPaymentIntent['status']; provider?: AdminPaymentIntent['provider']; phone?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<AdminPaymentIntent[]>(`/admin/payment-intents${qs ? `?${qs}` : ''}`)
}

export interface RevenueReport {
  totalRevenue: number
  bookingCount: number
  averageFare: number
  pendingAmount: number
  pendingCount: number
  cancelledCount: number
  byPaymentMethod: { paymentMethod: string; amount: number; count: number }[]
  byRoute: { routeLabel: string; amount: number; count: number }[]
}

export function getRevenueReport(params?: { from?: string; to?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<RevenueReport>(`/admin/reports/revenue${qs ? `?${qs}` : ''}`)
}

export interface OccupancyReport {
  overallOccupancyRate: number
  totalSeats: number
  totalBookedSeats: number
  tripCount: number
  byRoute: { routeLabel: string; totalSeats: number; bookedSeats: number; tripCount: number; occupancyRate: number }[]
  trips: {
    tripId: string
    routeLabel: string
    departureTime: string
    status: string
    totalSeats: number
    bookedSeats: number
    occupancyRate: number
  }[]
}

export function getOccupancyReport(params?: { from?: string; to?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<OccupancyReport>(`/admin/reports/occupancy${qs ? `?${qs}` : ''}`)
}

export interface SegmentOccupancy {
  tripId: string
  segments: { segmentId: string; segmentLabel: string; totalSeats: number; bookedSeats: number; occupancyRate: number }[]
}

export function getSegmentOccupancy(tripId: string) {
  return api.get<SegmentOccupancy>(`/admin/reports/occupancy/${tripId}/segments`)
}

export interface RatingsReport {
  byDriver: { driverId: string; driverName: string; avgRating: number; ratingCount: number }[]
  byRoute: { routeId: string; routeLabel: string; avgRating: number; ratingCount: number }[]
}

export function getRatingsReport() {
  return api.get<RatingsReport>('/admin/reports/ratings')
}

export interface OpenTicketsReport {
  complaints: { open: number; inReview: number }
  supportTickets: { open: number }
}

export function getOpenTicketsReport() {
  return api.get<OpenTicketsReport>('/admin/reports/open-tickets')
}

// ------------------------------------------------------------
// Wallet
// ------------------------------------------------------------

export interface WalletTransaction {
  id: string
  type: 'fund' | 'debit' | 'refund'
  amount: string
  bookingId: string | null
  createdAt: string
}

export interface WalletSummary {
  balance: string
  transactions: WalletTransaction[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export function getWallet(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v).map(([k, v]) => [k, String(v)])),
  ).toString()
  return api.get<WalletSummary>(`/wallet${qs ? `?${qs}` : ''}`)
}

export function initiateWalletTopup(amount: number, provider: 'squad' | 'paystack') {
  return api.post<{ reference: string; checkoutUrl: string; amount: number }>('/wallet/topup/initiate', {
    amount,
    provider,
  })
}

// ------------------------------------------------------------
// Park staff
// ------------------------------------------------------------

export interface StaffTrip {
  id: string
  departureTime: string
  routeLabel: string
  bus: Bus | null
}

export function listStaffTrips(params?: { date?: string }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<StaffTrip[]>(`/staff/trips${qs ? `?${qs}` : ''}`)
}

export function manualBooking(payload: {
  tripId: string
  seatId: string
  boardStopId: string
  alightStopId: string
  passengerName: string
  passengerPhone: string
  paymentMethod?: 'pay_at_park' | 'wallet'
}) {
  return api.post<{ ticket: Ticket }>('/staff/bookings/manual', payload)
}

export interface StaffPendingPayment {
  id: string
  amount: string
  class: 'standard' | 'luxury' | 'vip'
  createdAt: string
  payAtParkCutoff: string | null
  riderPhone: string
  riderName: string | null
  seatNumber: string
  boardParkName: string
  alightParkName: string
  departureTime: string
  busPlate: string | null
}

export function listPendingPayments() {
  return api.get<StaffPendingPayment[]>('/staff/bookings/pending-payments')
}

export function markPaid(bookingId: string) {
  return api.post<{ ticket: Ticket }>(`/staff/bookings/${bookingId}/mark-paid`)
}

export interface StaffCheckinResult {
  id: string
  status: string
  boarded: boolean
  boardedAt: string | null
  riderPhone: string
  riderName: string | null
  seatNumber: string
  boardParkName: string
  alightParkName: string
  departureTime: string
}

export function searchCheckin(query: string) {
  const qs = new URLSearchParams({ query }).toString()
  return api.get<StaffCheckinResult[]>(`/staff/checkin/search?${qs}`)
}

export function boardBooking(bookingId: string) {
  return api.post<StaffCheckinResult>(`/staff/checkin/${bookingId}/board`)
}

export interface ManifestPassenger {
  bookingId: string
  passengerName: string | null
  passengerPhone: string
  seatNumber: string
  segment: string
  status: string
  boarded: boolean
  boardedAt: string | null
}

export interface Manifest {
  trip: { id: string; departureTime: string; routeLabel: string; busPlate: string | null }
  passengers: ManifestPassenger[]
}

export function getManifest(tripId: string) {
  return api.get<Manifest>(`/staff/manifest/${tripId}`)
}

// ------------------------------------------------------------
// Trip alerts (admin post + rider "Travel Updates")
// ------------------------------------------------------------

export interface TripAlert {
  id: string
  type: 'delay' | 'route_change' | 'cancellation' | 'holiday_notice'
  message: string
  createdAt: string
  tripLabel: string | null
  routeLabel: string | null
}

export interface AdminTripAlert extends TripAlert {
  tripId: string | null
  routeId: string | null
}

export function listAdminTripAlerts() {
  return api.get<AdminTripAlert[]>('/admin/trip-alerts')
}

export function createTripAlert(payload: {
  type: TripAlert['type']
  message: string
  tripId?: string
  routeId?: string
}) {
  return api.post<{ id: string; notifiedCount: number }>('/admin/trip-alerts', payload)
}

export function listMyTripAlerts() {
  return api.get<TripAlert[]>('/alerts')
}

// ------------------------------------------------------------
// Complaints
// ------------------------------------------------------------

export interface Complaint {
  id: string
  category: string
  message: string
  status: 'open' | 'in_review' | 'resolved'
  resolutionNotes: string | null
  createdAt: string
  resolvedAt: string | null
  tripLabel: string | null
}

export interface AdminComplaint extends Complaint {
  riderPhone: string
  riderName: string | null
}

export function listMyComplaints() {
  return api.get<Complaint[]>('/complaints')
}

export function createComplaint(payload: { category: string; message: string; tripId?: string }) {
  return api.post<Complaint>('/complaints', payload)
}

export function listAdminComplaints(params?: { status?: Complaint['status'] }) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<AdminComplaint[]>(`/admin/complaints${qs ? `?${qs}` : ''}`)
}

export function updateAdminComplaint(
  id: string,
  payload: { status: Complaint['status']; resolutionNotes?: string },
) {
  return api.patch<AdminComplaint>(`/admin/complaints/${id}`, payload)
}

// ------------------------------------------------------------
// Lost & found
// ------------------------------------------------------------

export interface LostFoundItem {
  id: string
  type: 'lost' | 'found'
  description: string
  contactInfo: string | null
  status: 'open' | 'claimed' | 'closed'
  createdAt: string
  tripLabel: string | null
  parkName: string | null
}

export function listLostFound(params?: {
  type?: LostFoundItem['type']
  query?: string
  routeId?: string
  date?: string
  mine?: boolean
}) {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    ),
  ).toString()
  return api.get<LostFoundItem[]>(`/lost-found${qs ? `?${qs}` : ''}`)
}

export function reportLostItem(payload: { description: string; contactInfo?: string; tripId?: string }) {
  return api.post<LostFoundItem>('/lost-found', payload)
}

export function listStaffLostFound() {
  return api.get<LostFoundItem[]>('/staff/lost-found')
}

export function logFoundItem(payload: { description: string; contactInfo?: string; tripId?: string }) {
  return api.post<LostFoundItem>('/staff/lost-found', payload)
}

export function updateLostFoundStatus(id: string, status: LostFoundItem['status']) {
  return api.patch<LostFoundItem>(`/staff/lost-found/${id}`, { status })
}

// ------------------------------------------------------------
// Support tickets
// ------------------------------------------------------------

export interface SupportTicket {
  id: string
  category: 'payment' | 'booking' | 'technical' | 'other'
  message: string
  status: 'open' | 'resolved'
  createdAt: string
}

export interface AdminSupportTicket extends SupportTicket {
  riderPhone: string
  riderName: string | null
}

export function listMySupportTickets() {
  return api.get<SupportTicket[]>('/support-tickets')
}

export function createSupportTicket(payload: { category: SupportTicket['category']; message: string }) {
  return api.post<SupportTicket>('/support-tickets', payload)
}

export function listAdminSupportTickets(params?: {
  status?: SupportTicket['status']
  category?: SupportTicket['category']
}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v)) as Record<string, string>,
  ).toString()
  return api.get<AdminSupportTicket[]>(`/admin/support-tickets${qs ? `?${qs}` : ''}`)
}

export function resolveSupportTicket(id: string, status: SupportTicket['status']) {
  return api.patch<AdminSupportTicket>(`/admin/support-tickets/${id}`, { status })
}

export function recomputeWalletBalance(userId: string) {
  return api.post<{ userId: string; previousBalance: number; recomputedBalance: number; corrected: boolean }>(
    `/admin/wallet/${userId}/recompute`,
  )
}
