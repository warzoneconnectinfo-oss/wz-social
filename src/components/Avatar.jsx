const SIZES = {
  xs: { box: 'w-6 h-6',   text: 'text-[10px]', dot: 'w-1.5 h-1.5' },
  sm: { box: 'w-8 h-8',   text: 'text-xs',      dot: 'w-2 h-2'     },
  md: { box: 'w-9 h-9',   text: 'text-sm',      dot: 'w-2.5 h-2.5' },
  lg: { box: 'w-12 h-12', text: 'text-base',    dot: 'w-3 h-3'     },
  xl: { box: 'w-16 h-16', text: 'text-xl',      dot: 'w-3.5 h-3.5' },
};

// online = true  → green dot
// online = false → gray dot  (only when showOffline is also true)
// online = undefined/null → no dot
export default function Avatar({ url, name = '?', size = 'md', online, showOffline = false, className = '' }) {
  const s = SIZES[size] || SIZES.md;
  const initial = (name || '?')[0].toUpperCase();
  const showGreen = online === true;
  const showGray  = online === false && showOffline;

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {url ? (
        <img
          src={url}
          alt={name}
          className={`${s.box} rounded-full object-cover border border-orange-500/30`}
          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
        />
      ) : null}
      <div
        className={`${s.box} ${s.text} rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 font-bold`}
        style={{ display: url ? 'none' : 'flex' }}
      >
        {initial}
      </div>
      {showGreen && (
        <span className={`absolute bottom-0 right-0 ${s.dot} rounded-full bg-green-500 border-2 border-zinc-900`} />
      )}
      {showGray && (
        <span className={`absolute bottom-0 right-0 ${s.dot} rounded-full bg-zinc-500 border-2 border-zinc-900`} />
      )}
    </div>
  );
}
