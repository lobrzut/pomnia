/** Animated aurora background — three drifting, blurred color blobs + film grain. */
export default function Aurora() {
  return (
    <>
      <div className="aurora">
        <div
          className="blob"
          style={{ width: 620, height: 620, left: '-8%', top: '-12%', background: 'radial-gradient(circle, #6366f1, transparent 60%)', animationDelay: '0s' }}
        />
        <div
          className="blob"
          style={{ width: 540, height: 540, right: '-6%', top: '6%', background: 'radial-gradient(circle, #22d3ee, transparent 60%)', animationDelay: '-8s' }}
        />
        <div
          className="blob"
          style={{ width: 680, height: 680, left: '24%', bottom: '-22%', background: 'radial-gradient(circle, #8b5cf6, transparent 60%)', animationDelay: '-15s' }}
        />
      </div>
      <div className="grain" />
    </>
  )
}
