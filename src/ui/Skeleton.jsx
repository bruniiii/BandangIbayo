// Skeleton loading: grey shapes in the layout of the content that's
// loading, instead of a spinner. The shimmer is the .skel class in
// index.css (it stops when the device asks for reduced motion).

export const Skel = ({ w = '100%', h = 12, r = 8, dark = false, style }) => (
  <span aria-hidden="true" className={dark ? 'skel skel-dark' : 'skel'} style={{ display: 'block', width: w, height: h, borderRadius: r, flexShrink: 0, ...style }} />
);

// Wraps a skeleton so screen readers hear "Loading…" once.
export const SkeletonRegion = ({ label = 'Loading', children, style }) => (
  <div role="status" aria-live="polite" aria-busy="true" style={style}>
    <span className="sr-only">{label}…</span>
    {children}
  </div>
);

const card = {
  background: '#FDF6EE', borderRadius: 22, overflow: 'hidden',
  border: '1px solid rgba(180,81,30,0.12)', boxShadow: '0 4px 16px rgba(26,10,0,0.05)',
};

// Tour cards (Explore Tours, Tour Management, landing, /tours).
export const SkeletonTourCards = ({ count = 6, imageHeight = 186, label = 'Loading tours', minWidth = 280 }) => (
  <SkeletonRegion label={label} style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${minWidth}px, 100%), 1fr))`, gap: 20 }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column' }}>
        <Skel h={imageHeight} r={0} />
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Skel w="60%" h={16} />
            <Skel w="22%" h={16} />
          </div>
          <Skel w="40%" h={11} />
          <Skel w="55%" h={11} />
          <Skel w="45%" h={11} />
          <Skel h={40} r={12} style={{ marginTop: 6 }} />
        </div>
      </div>
    ))}
  </SkeletonRegion>
);

// A list of people or items: round picture, two lines, something on the right.
export const SkeletonRows = ({ count = 5, avatar = true, label = 'Loading', boxed = true }) => (
  <SkeletonRegion label={label} style={boxed ? { ...card, padding: '0.5rem 1.25rem' } : undefined}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderTop: i ? '1px solid rgba(180,81,30,0.08)' : 'none' }}>
        {avatar && <Skel w={40} h={40} r={999} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <Skel w={`${55 - (i % 3) * 10}%`} h={13} />
          <Skel w={`${75 - (i % 2) * 20}%`} h={10} />
        </div>
        <Skel w={64} h={12} />
      </div>
    ))}
  </SkeletonRegion>
);

// A table: header row and rows of cells.
export const SkeletonTable = ({ rows = 6, cols = 6, label = 'Loading records' }) => (
  <SkeletonRegion label={label} style={{ ...card, padding: '0 1.25rem' }}>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, padding: '16px 0', borderBottom: '1px solid rgba(180,81,30,0.12)' }}>
      {Array.from({ length: cols }, (_, c) => <Skel key={c} w="60%" h={10} />)}
    </div>
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 16, alignItems: 'center', padding: '16px 0', borderTop: r ? '1px solid rgba(180,81,30,0.08)' : 'none' }}>
        {Array.from({ length: cols }, (_, c) => (
          c === 0
            ? <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><Skel w="85%" h={12} /><Skel w="55%" h={9} /></div>
            : <Skel key={c} w={`${50 + ((r + c) % 3) * 15}%`} h={11} />
        ))}
      </div>
    ))}
  </SkeletonRegion>
);

// Feed or review posts: picture and name, a few lines of text, a photo.
export const SkeletonPosts = ({ count = 3, withImage = true, label = 'Loading posts' }) => (
  <SkeletonRegion label={label} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} style={{ ...card, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skel w={44} h={44} r={12} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Skel w="35%" h={13} />
            <Skel w="22%" h={10} />
          </div>
        </div>
        <Skel w="92%" h={11} />
        <Skel w="70%" h={11} />
        {withImage && i === 0 && <Skel h={220} r={14} />}
      </div>
    ))}
  </SkeletonRegion>
);

// Plain lines of text, for small panels.
export const SkeletonLines = ({ lines = 3, dark = false, label = 'Loading', style }) => (
  <SkeletonRegion label={label} style={{ display: 'flex', flexDirection: 'column', gap: 9, ...style }}>
    {Array.from({ length: lines }, (_, i) => <Skel key={i} dark={dark} w={`${90 - (i % 3) * 18}%`} h={11} />)}
  </SkeletonRegion>
);
