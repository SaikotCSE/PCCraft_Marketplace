// ShareBuildModal — shows the public share URL with copy-to-clipboard.
//
// `usePCBuilder.shareBuild()` does the heavy lifting (POST /builds/ if
// no buildId yet, return `{ url, token }`). We just surface the URL
// and let the user copy it.
//
//   <ShareBuildModal
//     open={shareOpen}
//     onClose={() => setShareOpen(false)}
//     onShared={({ url, token }) => setShareUrl(url)}
//   />
//
// `onShared` lets the parent (MyBuildsPage) capture the URL for its own
// copy-row UI without forcing a re-fetch of the modal.

import { useEffect, useState } from 'react';
import { Clipboard, ClipboardCheck, Loader2, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

import Modal from '@components/common/Modal';
import { usePCBuilder } from '@hooks/usePCBuilder';
import { cn } from '@utils/cn';

const ShareBuildModal = ({ open, onClose, onShared }) => {
  const shareBuild = usePCBuilder((s) => s.shareBuild);
  const isSharing = usePCBuilder((s) => s.isSharing);

  const [url, setUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  // Whenever the modal opens, kick off the share. Close-out resets.
  useEffect(() => {
    if (!open) {
      setUrl(null);
      setCopied(false);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await shareBuild();
        if (cancelled) return;
        setUrl(result.url);
        onShared?.(result);
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.response?.data?.error?.message ||
            err?.message ||
            'Could not generate a share link.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shareBuild, onShared]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older browsers / insecure contexts.
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success('Share link copied.');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copy failed — please copy manually.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Share your build" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Share2 className="h-4 w-4" aria-hidden="true" />
          <span>
            Anyone with this link can view the build (read-only). Make the
            build public from your saves list if it isn’t already.
          </span>
        </div>

        {error ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : isSharing || !url ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface-50 px-3 py-3 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Generating share link…
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Public URL
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition',
                  copied
                    ? 'bg-emerald-500 text-white'
                    : 'bg-accent-500 text-white hover:bg-accent-400',
                )}
              >
                {copied ? (
                  <>
                    <ClipboardCheck className="h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Clipboard className="h-4 w-4" /> Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              The link points to a read-only snapshot of this build, including
              all components and compatibility results.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ShareBuildModal;