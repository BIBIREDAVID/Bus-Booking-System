import { useRef } from 'react'

export default function OtpInput({ length = 6, value, onChange }) {
  const inputRefs = useRef([])

  function setDigit(index, digit) {
    const digits = value.split('')
    digits[index] = digit
    onChange(digits.join('').slice(0, length))
  }

  function handleChange(index, e) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) {
      setDigit(index, '')
      return
    }
    // Handle pasting a full code into one box.
    if (raw.length > 1) {
      onChange(raw.slice(0, length).padEnd(value.length, '').slice(0, length))
      const nextIndex = Math.min(raw.length, length) - 1
      inputRefs.current[nextIndex]?.focus()
      return
    }
    setDigit(index, raw)
    if (index < length - 1) inputRefs.current[index + 1]?.focus()
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  return (
    <div className="flex justify-between gap-2">
      {Array.from({ length }).map((_, index) => {
        const digit = value[index] ?? ''
        const isActive = index === value.length
        return (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            maxLength={length}
            value={digit}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`h-14 w-12 rounded-xl border text-center text-xl font-semibold text-ink-900 outline-none transition-colors ${
              isActive ? 'border-brand-600 ring-2 ring-brand-100' : 'border-brand-100'
            }`}
          />
        )
      })}
    </div>
  )
}
