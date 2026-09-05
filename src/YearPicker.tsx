import { useEffect, useRef, useState } from 'react';
import { yearOptions } from './data';

/** A native <select> can't theme its own popup — that list is OS chrome and
 *  ignores the page's tokens. This renders the menu itself so it matches. */
export default function YearPicker({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const years = yearOptions();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="yp" ref={box}>
      <button className="ypb" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {value}
        <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
          <path d="M1 1.5 4.5 5 8 1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul className="ypm" role="listbox" tabIndex={-1}>
          {years.map(y => (
            <li key={y}>
              <button role="option" aria-selected={y === value}
                      onClick={() => { onChange(y); setOpen(false); }}>
                {y}
                {y === value && <span className="tick">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
