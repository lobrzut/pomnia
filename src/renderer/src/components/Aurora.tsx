// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Pomnia
/** Animated aurora background — blob colors follow data-theme CSS vars. */
export default function Aurora() {
  return (
    <>
      <div className="aurora">
        <div
          className="blob"
          style={{
            width: 620,
            height: 620,
            left: '-8%',
            top: '-12%',
            background: 'radial-gradient(circle, var(--aurora-1), transparent 60%)',
            animationDelay: '0s',
          }}
        />
        <div
          className="blob"
          style={{
            width: 540,
            height: 540,
            right: '-6%',
            top: '6%',
            background: 'radial-gradient(circle, var(--aurora-2), transparent 60%)',
            animationDelay: '-8s',
          }}
        />
        <div
          className="blob"
          style={{
            width: 680,
            height: 680,
            left: '24%',
            bottom: '-22%',
            background: 'radial-gradient(circle, var(--aurora-3), transparent 60%)',
            animationDelay: '-15s',
          }}
        />
      </div>
      <div className="grain" />
    </>
  )
}
