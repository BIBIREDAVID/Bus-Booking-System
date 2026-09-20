# Interstate Bus Booking App — Full Plan

## 1. Overview

A booking platform for a single interstate bus operator running **10 parks** and **30 routes** (mixed direct and multi-stop, with mixed boarding/non-boarding stops), replacing manual ticketing with online seat booking, wallet payments, pay-at-park option, fleet/driver management (new for this client), and a set of passenger-experience features (live tracking, stop alerts, service alerts, lost & found, support, ratings).

Built on: React + Vite, Firebase (Firestore, Admin SDK, Auth, Functions), Vercel, Nigerian payment gateways (Squad, Paystack).

---

## 2. User Roles

| Role | Scope |
|---|---|
| **Rider** | Books trips, manages wallet, views bookings, sets stop alerts, submits complaints/lost & found, rates trips |
| **Park staff** | Individual accounts, scoped to own park — check-in, manual bookings, mark pay-at-park paid, handle local lost & found |
| **Admin** | Full access — routes, fleet, drivers, fares, reports, service alerts, complaint resolution |

Individual staff accounts (not shared per-park logins) so every action is attributable to a real person. Enforced via Firestore security rules matching `role` + `homeParkId`.

---

## 3. Data Model (Firestore)

```
parks/{parkId}
  name, address, city, state

routes/{routeId}
  originParkId, destParkId, durationMins
  stops: [{ parkId, order, arrivalOffsetMins, departureOffsetMins, isBoardingPoint }]
  segments: [{ fromParkId, toParkId, fareByClass: { standard, luxury, vip } }]

buses/{busId}
  plate, capacity, class, status (active|maintenance)

drivers/{driverId}
  name, phone, licenseNo, status

trips/{tripId}
  routeId, busId, driverId, departureTime, status
trips/{tripId}/seats/{seatId}
  seatNumber, class   // availability computed per segment via bookings overlap
trips/{tripId}/location
  lat, lng, updatedAt   // populated once Phase 3 GPS ships
trips/{tripId}/alerts/{alertId}
  type: delay|route-change|cancellation|holiday-notice
  message, createdBy, createdAt

users/{userId}
  name, phone, email, role, homeParkId (staff only), preferredLanguage
users/{userId}/passengers/{id}
  saved passengers for booking on behalf of others
users/{userId}/stopAlerts/{alertId}
  tripId, targetParkId, notifyMinsBefore, status (active|fired|cancelled)

wallets/{userId}
  balance   // denormalized cache
wallets/{userId}/transactions/{id}
  type: fund|debit|refund, amount, createdAt   // immutable ledger, source of truth

bookings/{bookingId}
  userId, tripId, seatId, boardParkId, alightParkId, class,
  paymentMethod, amount, status, performedBy (staff bookings), createdAt
bookings/{bookingId}/rating
  stars, comment, createdAt   // submitted post-journey

complaints/{complaintId}
  userId, tripId (optional), category, message, status (open|in-review|resolved),
  assignedTo, createdAt, resolvedAt

lostFound/{itemId}
  type: lost|found, tripId, description, contactInfo, submittedBy,
  status (open|claimed|closed), homeParkId, createdAt

supportTickets/{ticketId}
  userId, category (payment|booking|technical|other), message,
  status (open|resolved), createdAt
```

---

## 4. Segment-Aware Seat Logic

The trickiest correctness-critical piece — worth building carefully.

- A seat's availability for a search (board X → alight Y) is computed from existing `bookings` on that seat, checking for **overlapping segments** on the route's ordered stop list — not a flat status flag. The same physical seat can be sold multiple times across one trip (e.g. A→B, then resold B→D).
- A **Firestore transaction** performs the overlap check + reservation atomically, closing the race condition where two riders try to book overlapping segments on the same seat simultaneously.
- A short-lived `holds/{holdId}` document (seatId + tripId + segment + expiry) represents an in-progress checkout; a scheduled Cloud Function purges expired holds so seats aren't lost to abandoned checkouts.
- Search resolves a rider's origin/destination to a valid segment only when both parks are `isBoardingPoint: true` stops on the same route, in the correct order.

---

## 5. Booking Flow

1. Rider searches origin park → destination park → date.
2. Matching trips returned (route's boarding stops include both parks, in order).
3. Rider picks class → seat map shows seats available *for that specific segment*.
4. Transaction creates a short hold on the seat for that segment.
5. Checkout — one of:
   - **Wallet** (sufficient balance) → atomic debit + booking creation + ledger entry
   - **Wallet shortfall** → top-up via Squad/Paystack then immediate debit, one flow
   - **Squad/Paystack direct** → webhook (Cloud Function, server-side verified) confirms → booking created
   - **Pay at park** → booking created as `reserved-unpaid`, held until a cutoff (e.g. 2 hrs pre-departure); staff mark paid at counter → `booked`
6. On `booked`: e-ticket + QR generated, confirmation sent (SMS/WhatsApp/email), pre-departure reminder scheduled.
7. Expired holds / unpaid pay-at-park reservations auto-release via scheduled Cloud Function.
8. Post-journey (trip status → completed): rider is prompted for a star rating + optional comment, stored under the booking.

---

## 6. Cancellation / Reschedule

- Fixed, standard rules — enforced server-side, no per-route variation.
- Suggested defaults **(confirm exact numbers with client)**: cancel >24hrs before departure → 100% wallet refund; <24hrs → no refund; one free reschedule up to 2hrs before departure, subject to segment availability on the new trip.
- No manual approval queue for standard cases — only a lightweight dispute/edge-case queue for admin.
- Refunds credit wallet only (matches top-up-and-spend-only wallet model — no bank payout logic needed).

---

## 7. Wallet

- Top-up-and-spend only — no withdrawal, no bank linking, no KYC tiers.
- Fund via Squad/Paystack, webhook-verified server-side, Cloud Function credits balance + writes ledger entry.
- Balance is a denormalized cache; the transaction ledger is the source of truth if they ever disagree.

---

## 8. Fleet & Driver Management (new capability for this client)

- Admin registers buses (plate, capacity, class, status) and drivers (name, phone, license).
- Trips are generated from a **route schedule template** (e.g. Route A departs 6am/12pm/6pm daily) — admin sets the template, a Cloud Function generates individual trip documents with fresh seat inventories ahead of time (rolling 30-day window).
- Admin assigns bus + driver to each generated trip, can swap either for breakdowns or driver unavailability.

---

## 9. Park Staff Tools

- Individual logins, scoped to `homeParkId` (enforced in security rules).
- Manual booking entry for walk-in/phone customers.
- Mark pay-at-park reservations as paid.
- Check-in view: scan ticket QR or search by name/phone, mark boarded — per segment, since a passenger may alight before the trip's final stop.
- Live, printable manifest per trip: passenger, seat, segment, phone, boarding status.
- Log local lost & found items found at their park or on arriving buses.

---

## 10. Passenger Experience Features

**Live tracking + smart stop alerts** *(Phase 3, built together)*
- Driver-side lightweight web app pings `trips/{tripId}/location` every ~30s during an active trip.
- Rider sets a `stopAlerts` entry (trip + their alight park + "notify me N minutes before"); a Cloud Function watching live location vs. remaining distance/time to that stop triggers a push/SMS when the threshold is crossed.
- Built on the existing segment model at no extra data-modeling cost.

**Delay / route-change / service alert feed** *(Phase 2)*
- Admin posts an alert (delay, route change, cancellation, holiday schedule) attached to a trip or route.
- Cloud Function pushes notification to every rider with an active booking on affected trips.
- Also viewable in-app under a general "Travel Updates" tab.

**Complaints** *(Phase 2)*
- Rider submits a complaint (optionally tied to a trip); admin dashboard triages by status.
- Passenger-submitted traffic reporting deprioritized — low value for a single operator, can revisit later.

**Lost & found** *(Phase 2)*
- Riders submit lost items or park staff log found items; searchable by route/date/description.
- Status tracked (open/claimed/closed) so staff can close out matches.

**Journey rating** *(Phase 2)*
- Star rating + optional comment prompted after trip completion.
- Feeds admin reports — flags underperforming drivers/routes.

**Support** *(Phase 2)*
- Structured ticket system with categories (payment failed, booking issue, technical, other) rather than live chat — lower operational commitment for a single operator. Can upgrade to live chat later if support volume justifies it.

**Language selection** *(flagged, not committed)*
- Needs a decision from the client: does the rider base need more than English? Real i18n (all UI strings, SMS/notification templates) is a scope decision, not a small add-on — worth confirming before Phase 1 starts since retrofitting later touches every screen.

---

## 11. Security Essentials

- All payment confirmation (Squad/Paystack webhooks) verified server-side in Cloud Functions — client never marks a booking paid.
- All seat/segment reservation logic happens inside Firestore transactions — no read-then-write race conditions.
- Firestore security rules enforce role + park scoping (a park-staff account for Park A can never read/write Park B's data).
- Refund/cancellation rule engine and segment-fare logic live server-side so they can't be bypassed from the client.
- Complaint/lost & found/support submissions rate-limited per user to prevent spam.

---

## 12. Phased Roadmap

### Phase 1 — MVP
- Accounts/auth (individual, incl. staff)
- Park/route/bus/driver admin setup, including mixed stops + segment fares
- Trip schedule generation
- Segment-aware seat map + hold
- Checkout (wallet + Squad/Paystack + pay-at-park)
- Fixed cancel/reschedule rules
- E-ticket/QR
- Wallet fund/balance/ledger
- Static route map with stop markers
- Park-staff dashboard (manual booking, mark paid, per-segment manifest)

### Phase 2
- QR check-in scanning
- Occupancy & revenue reports (per route, per segment)
- Delay/route-change/service alert feed
- Complaints system
- Lost & found
- Journey ratings
- Structured support tickets
- Admin dispute/edge-case queue

### Phase 3
- Live GPS tracking (driver-side start/end-trip web app)
- Smart stop alerts (built on live tracking)
- Parcel/luggage booking
- Promo codes
- Referral program (wallet-credit based)

---

## 13. Open Items for the Client

- Exact refund %/cutoff hours for the "standard" cancellation/reschedule policy
- Which 10 parks/cities specifically, and which intermediate stops per route are boarding-enabled — needed to seed realistic segment fares
- Per-class fare structure (or confirm placeholder ranges: Standard ₦8,000–15,000, Luxury ₦12,000–22,000, VIP ₦18,000–30,000, adjusted by distance)
- Whether multi-language support is needed, and which languages
