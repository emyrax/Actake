import React, { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  /** 'compact' for top bars/cards, 'card' for Settings section */
  variant?: 'compact' | 'card';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showChromeHint, setShowChromeHint] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div className={`actake-card px-5 py-4 flex items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Actake App Installed
              </div>
              <div className="text-xs text-[#6B6663] truncate">
                Running in standalone mode on your device
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    setShowChromeHint(true);
  };

  if (variant === 'compact') {
    // Only show compact button when browser signals installability or on iOS
    if (!isInstallable && !isIOS) return null;

    return (
      <>
        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className={`min-h-[40px] px-3.5 py-2 rounded-full bg-[#FFF0E6] hover:bg-[#F16A2E] text-[#111114] hover:text-white border border-[#F2D5C4] text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${className}`}
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Install App</span>
        </button>
        {showIOSGuide && <IOSInstallModal onClose={() => setShowIOSGuide(false)} />}
      </>
    );
  }

  // Full Settings Card Variant
  return (
    <>
      <div
        className={`actake-card px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold text-[#111114]">
              Install Actake Web App
            </div>
            <div className="text-xs text-[#6B6663] leading-relaxed">
              {isInstallable
                ? 'Install directly from Chrome for full-screen standalone launch & fast offline access.'
                : isIOS
                  ? 'Add Actake to your iPhone or iPad Home Screen for a full-screen app experience.'
                  : 'Open in Chrome or Edge to install Actake onto your home screen or desktop.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handleInstallClick()}
          className="min-h-[44px] px-4 py-2 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{isInstallable ? 'Install Now' : isIOS ? 'How to Install' : 'Install Guide'}</span>
        </button>
      </div>

      {showIOSGuide && <IOSInstallModal onClose={() => setShowIOSGuide(false)} />}
      {showChromeHint && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install Actake on Chrome"
          onClick={() => setShowChromeHint(false)}
          className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[24px] bg-white border border-[#EFE2D9] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-extrabold text-[#111114]">
                Install Actake in Chrome
              </h3>
              <button
                type="button"
                onClick={() => setShowChromeHint(false)}
                aria-label="Close install instructions"
                className="w-9 h-9 rounded-full bg-[#FAF3ED] hover:bg-[#F2E2D8] flex items-center justify-center text-[#111114]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[#57524E] leading-relaxed">
              Open <strong className="text-[#111114]">actake.vercel.app</strong> in Chrome, then tap
              the <strong className="text-[#111114]">Install</strong> icon in the address bar (or
              menu <strong className="text-[#111114]">⋮ → Add to Home screen / Install app</strong>).
            </p>
            <button
              type="button"
              onClick={() => setShowChromeHint(false)}
              className="w-full min-h-[44px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-sm font-bold transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const IOSInstallModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Install Actake on iPhone or iPad"
    onClick={onClose}
    className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4"
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-sm rounded-[24px] bg-white border border-[#EFE2D9] p-6 shadow-2xl space-y-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold text-[#111114]">
          Install on iPhone / iPad
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close iOS install instructions"
          className="w-9 h-9 rounded-full bg-[#FAF3ED] hover:bg-[#F2E2D8] flex items-center justify-center text-[#111114]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <ol className="space-y-2.5 text-sm text-[#57524E] leading-relaxed">
        <li className="flex items-start gap-2">
          <span className="font-mono font-bold text-[#F16A2E]">1.</span>
          <span>
            Tap the <Share className="w-3.5 h-3.5 inline mx-0.5 text-[#111114]" />{' '}
            <strong className="text-[#111114]">Share</strong> button in Safari&apos;s toolbar.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="font-mono font-bold text-[#F16A2E]">2.</span>
          <span>
            Scroll down and tap <strong className="text-[#111114]">Add to Home Screen</strong>.
          </span>
        </li>
      </ol>
      <button
        type="button"
        onClick={onClose}
        className="w-full min-h-[44px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-sm font-bold transition-colors"
      >
        Done
      </button>
    </div>
  </div>
);

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-[72px] left-1/2 -translate-x-1/2 z-[75] px-4 py-2 rounded-full bg-[#111114] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-xl border border-white/15 whitespace-nowrap"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
      <span>Offline Mode — Showing cached app data</span>
    </div>
  );
};
