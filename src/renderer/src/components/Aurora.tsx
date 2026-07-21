/** Animated aurora background — mint/forest blobs + film grain (matches floating pip). */
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
            background: 'radial-gradient(circle, #1a5c3a, transparent 60%)',
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
            background: 'radial-gradient(circle, #34d399, transparent 60%)',
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
            background: 'radial-gradient(circle, #2dd4bf55, transparent 60%)',
            animationDelay: '-15s',
          }}
        />
      </div>
      <div className="grain" />
    </>
  )
}
