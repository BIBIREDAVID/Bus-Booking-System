import { Routes, Route } from 'react-router-dom'
import RequireRole from './components/RequireRole'

import Splash from './pages/onboarding/Splash'
import { OnboardingFlowProvider } from './pages/onboarding/OnboardingFlowContext'
import Onboarding from './pages/onboarding/Onboarding'
import PhoneEntry from './pages/onboarding/PhoneEntry'
import OtpVerify from './pages/onboarding/OtpVerify'
import NameEntry from './pages/onboarding/NameEntry'

import RiderLayout from './pages/rider/RiderLayout'
import Home from './pages/rider/Home'
import Search from './pages/rider/Search'
import Bookings from './pages/rider/Bookings'
import Account from './pages/rider/Account'
import SeatMap from './pages/rider/SeatMap'
import Checkout from './pages/rider/Checkout'
import Ticket from './pages/rider/Ticket'
import Wallet from './pages/rider/Wallet'
import TravelUpdates from './pages/rider/TravelUpdates'
import RiderComplaints from './pages/rider/Complaints'
import RiderLostFound from './pages/rider/LostFound'
import RiderSupport from './pages/rider/Support'

import StaffLayout from './pages/staff/StaffLayout'
import Manifest from './pages/staff/Manifest'
import ManualBooking from './pages/staff/ManualBooking'
import PendingPayments from './pages/staff/PendingPayments'
import Checkin from './pages/staff/Checkin'
import LostFound from './pages/staff/LostFound'

import AdminLayout from './pages/admin/AdminLayout'
import Overview from './pages/admin/Overview'
import RoutesPage from './pages/admin/Routes'
import Fleet from './pages/admin/Fleet'
import Reports from './pages/admin/Reports'
import Complaints from './pages/admin/Complaints'
import PromoteUser from './pages/admin/PromoteUser'
import Schedules from './pages/admin/Schedules'
import Trips from './pages/admin/Trips'
import AdminBookings from './pages/admin/Bookings'
import Payments from './pages/admin/Payments'
import Alerts from './pages/admin/Alerts'
import AdminSupport from './pages/admin/Support'

function App() {
  return (
    <Routes>
      <Route path="/splash" element={<Splash />} />

      {/* Onboarding / OTP login */}
      <Route element={<OnboardingFlowProvider />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/onboarding/phone" element={<PhoneEntry />} />
        <Route path="/onboarding/otp" element={<OtpVerify />} />
      </Route>
      {/* Name entry needs the authed user (just logged in), not the phone-entry context */}
      <Route element={<RequireRole roles={['rider', 'park_staff', 'admin']} />}>
        <Route path="/onboarding/name" element={<NameEntry />} />
      </Route>

      {/* Rider app */}
      <Route element={<RequireRole roles={['rider']} />}>
        <Route element={<RiderLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/account" element={<Account />} />
          <Route path="/trips/:tripId/seats" element={<SeatMap />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/tickets/:bookingId" element={<Ticket />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/updates" element={<TravelUpdates />} />
          <Route path="/complaints" element={<RiderComplaints />} />
          <Route path="/lost-found" element={<RiderLostFound />} />
          <Route path="/support" element={<RiderSupport />} />
        </Route>
      </Route>

      {/* Park staff dashboard */}
      <Route element={<RequireRole roles={['park_staff']} />}>
        <Route element={<StaffLayout />}>
          <Route path="/staff" element={<Manifest />} />
          <Route path="/staff/bookings" element={<ManualBooking />} />
          <Route path="/staff/pending-payments" element={<PendingPayments />} />
          <Route path="/staff/checkin" element={<Checkin />} />
          <Route path="/staff/lost-found" element={<LostFound />} />
        </Route>
      </Route>

      {/* Admin dashboard */}
      <Route element={<RequireRole roles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Overview />} />
          <Route path="/admin/routes" element={<RoutesPage />} />
          <Route path="/admin/schedules" element={<Schedules />} />
          <Route path="/admin/trips" element={<Trips />} />
          <Route path="/admin/bookings" element={<AdminBookings />} />
          <Route path="/admin/payments" element={<Payments />} />
          <Route path="/admin/fleet" element={<Fleet />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/complaints" element={<Complaints />} />
          <Route path="/admin/promote" element={<PromoteUser />} />
          <Route path="/admin/alerts" element={<Alerts />} />
          <Route path="/admin/support" element={<AdminSupport />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default App
