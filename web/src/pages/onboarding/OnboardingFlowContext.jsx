import { createContext, useContext, useState } from 'react'
import { Outlet } from 'react-router-dom'

const OnboardingFlowContext = createContext(undefined)

// Holds the in-progress phone number between the phone-entry and
// OTP-verify steps. Intentionally not persisted — if the page is
// refreshed mid-flow the user just re-enters their number.
export function OnboardingFlowProvider() {
  const [phone, setPhone] = useState('')

  return (
    <OnboardingFlowContext.Provider value={{ phone, setPhone }}>
      <Outlet />
    </OnboardingFlowContext.Provider>
  )
}

export function useOnboardingFlow() {
  const ctx = useContext(OnboardingFlowContext)
  if (ctx === undefined) throw new Error('useOnboardingFlow must be used within OnboardingFlowProvider')
  return ctx
}
