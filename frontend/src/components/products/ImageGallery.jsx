// ImageGallery — main image + thumbnail strip. Used on ProductDetailPage.
//
// Spec §2.7. Receives `images = [{id, url, alt_text, is_primary, position}]`.
// Clicking a thumbnail swaps the main image; keyboard arrow keys supported.
import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="%23e5e7eb"/></svg>';

const ImageGallery = ({ images = [], alt = '' }) => {
  const safe = images.length
    ? images
    : [{ id: 'placeholder', url: PLACEHOLDER, alt_text: alt, is_primary: true, position: 0 }];
  const sorted = [...safe].sort(
    (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || (a.position ?? 0) - (b.position ?? 0),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const active = sorted[activeIdx] ?? sorted[0];

  const next = useCallback(
    () => setActiveIdx((i) => (i + 1) % sorted.length),
    [sorted.length],
  );
  const prev = useCallback(
    () => setActiveIdx((i) => (i - 1 + sorted.length) % sorted.length),
    [sorted.length],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface">
        <img
          src={active.url}
          alt={active.alt_text || alt}
          className="h-full w-full object-contain"
        />
        {sorted.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/80 p-2 shadow hover:bg-surface"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface/80 p-2 shadow hover:bg-surface"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {sorted.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              aria-label={`View image ${i + 1}`}
              className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                i === activeIdx ? 'border-accent-500' : 'border-border hover:border-accent-300'
              }`}
            >
              <img src={img.url} alt={img.alt_text || ''} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ImageGallery;