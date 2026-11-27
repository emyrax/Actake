import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Loader2,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { DiscoveredWalletOption, WalletSession } from '../types/actake';

export const POLLAR_LOGO_SRC = '/assets/aistudio/logo_pollar_1dbd6a87.webp';

interface UnifiedWalletListProps {
  wallets: DiscoveredWalletOption[];
  mode: 'select' | 'connect';
  selectedWalletId?: string;
  activeSession?: WalletSession | null;
  busy?: boolean;
  compact?: boolean;
  theme?: 'light' | 'dark';
  onSelect: (walletId: string) => void;
}

export function isWalletOptionActive(
  option: DiscoveredWalletOption,
  session?: WalletSession | null
): boolean {
  if (!session) return false;
  if (session.connectionKind === 'pollar') return option.kind === 'pollar';
  if (session.connectionKind === 'mwa') return option.kind === 'mwa';
  if (session.connectionKind === 'browser-vault') return option.kind === 'browser-vault';
  if (session.connectionKind === 'wallet-standard') {
    return (
      option.id === `std:${session.walletName}` ||
      option.name.toLowerCase() === session.walletName.toLowerCase()
    );
  }
  return false;
}

export function getWalletCapabilityLine(option: DiscoveredWalletOption): string {
  if (option.kind === 'pollar') return 'Email · Google · Passkey · Fiat RAMP';
  if (option.kind === 'mwa') return 'Android Chrome · Seeker Seed Vault';
  if (option.kind === 'wallet-standard') return 'Native Browser Extension · SIWS';
  return 'Local Ed25519 Keypair · Zero Setup';
}

export function SolflareMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="solflare-grad" x1="4" y1="28" x2="28" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FC822B" />
          <stop offset="100%" stopColor="#FFE14D" />
        </linearGradient>
      </defs>
      <path
        d="M16.6 3.2C18.5 7.4 23.6 9.8 25.4 14.5C27.2 19.2 24.4 25.6 18.6 27.8C20.2 24.5 19.2 21.4 16.5 19.5C15.9 22.4 13.7 24.6 11.1 25.9C7.8 23.7 6.1 19.4 7.3 15.1C8.3 11.4 12.6 8.3 16.6 3.2Z"
        fill="url(#solflare-grad)"
      />
      <path
        d="M16.1 11.1C17.8 13.4 20.5 15.1 20.8 18.2C21.1 20.8 19.2 23.4 16.3 24.3C17.2 22.1 16.5 19.9 14.7 18.6C14.1 20.3 12.8 21.5 11.3 22.2C9.9 20.3 9.7 17.6 10.9 15.5C12.1 13.4 14.4 12.3 16.1 11.1Z"
        fill="#FFF7C2"
        fillOpacity="0.88"
      />
    </svg>
  );
}

export function PhantomMark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#AB9FF2" />
      <path
        d="M24.6 15.2C24.6 10.7 21.1 7.4 16.4 7.4C11.4 7.4 7.4 11.5 7.4 16.7C7.4 21.3 10.7 24.5 15.2 24.5C17.5 24.5 19.7 23.4 21.3 21.8C23.5 19.6 24.6 17.5 24.6 15.2Z"
        fill="#FFFFFF"
      />
      <circle cx="14.2" cy="14.9" r="1.4" fill="#1C1929" />
      <circle cx="19.1" cy="14.9" r="1.4" fill="#1C1929" />
    </svg>
  );
}

export const WalletBrandIcon: React.FC<{
  option: DiscoveredWalletOption;
  isActive?: boolean;
  isSelected?: boolean;
  theme?: 'light' | 'dark';
  size?: 'sm' | 'md';
}> = ({ option, isActive = false, isSelected = false, theme = 'light', size = 'md' }) => {
  const [imgError, setImgError] = useState(false);
  const boxClass = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl';
  const imgClass = size === 'sm' ? 'w-5 h-5 rounded-md' : 'w-6 h-6 rounded-lg';
  const iconClass = size === 'sm' ? 'w-4 h-4' : 'w-4.5 h-4.5';

  // User-supplied real Pollar logo
  if (option.kind === 'pollar' && !imgError) {
    return (
      <span
        className={`${boxClass} flex items-center justify-center shrink-0 overflow-hidden border transition-colors ${
          theme === 'dark'
            ? 'bg-[#0C1324] border-white/15'
            : isSelected
              ? 'bg-[#0C1324] border-[#F16A2E]'
              : 'bg-[#0C1324] border-[#E5DAD0]'
        }`}
      >
        <img
          src={POLLAR_LOGO_SRC}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${imgClass} object-contain`}
        />
      </span>
    );
  }

  // Real Wallet Standard extension icon (Phantom, Solflare, Backpack, etc.)
  if (option.icon && !imgError) {
    return (
      <span
        className={`${boxClass} flex items-center justify-center shrink-0 border transition-colors ${
          theme === 'dark'
            ? 'bg-white/10 border-white/15'
            : isActive
              ? 'bg-[#ECFDF5] border-[#86EFAC]'
              : isSelected
                ? 'bg-[#FFF3EC] border-[#F16A2E]'
                : 'bg-white border-[#EFE3DB]'
        }`}
      >
        <img
          src={option.icon}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${imgClass} object-contain`}
        />
      </span>
    );
  }

  if (/solflare/i.test(option.name)) {
    return (
      <span
        className={`${boxClass} flex items-center justify-center shrink-0 ${
          theme === 'dark' ? 'bg-[#1F1711] border border-white/12' : 'bg-[#FFF5EC] border border-[#F5DEC9]'
        }`}
      >
        <SolflareMark className={imgClass} />
      </span>
    );
  }

  if (/phantom/i.test(option.name)) {
    return (
      <span className={`${boxClass} flex items-center justify-center shrink-0 overflow-hidden`}>
        <PhantomMark className="w-full h-full" />
      </span>
    );
  }

  if (option.kind === 'mwa') {
    return (
      <span
        className={`${boxClass} flex items-center justify-center shrink-0 transition-colors ${
          isActive
            ? 'bg-[#16A34A] text-white'
            : theme === 'dark'
              ? 'bg-[#1D1B35] text-[#A5B4FC] border border-white/12'
              : 'bg-[#EEF2FF] text-[#4F46E5]'
        }`}
      >
        <Smartphone className={iconClass} />
      </span>
    );
  }

  if (option.kind === 'wallet-standard') {
    return (
      <span
        className={`${boxClass} flex items-center justify-center shrink-0 transition-colors ${
          isActive
            ? 'bg-[#16A34A] text-white'
            : theme === 'dark'
              ? 'bg-white/10 text-[#F16A2E] border border-white/12'
              : 'bg-[#FFF4EE] text-[#F16A2E]'
        }`}
      >
        <Wallet className={iconClass} />
      </span>
    );
  }

  return (
    <span
      className={`${boxClass} flex items-center justify-center shrink-0 transition-colors ${
        isActive
          ? 'bg-[#16A34A] text-white'
          : theme === 'dark'
            ? 'bg-[#0F241D] text-[#34D399] border border-emerald-500/25'
            : 'bg-[#ECFDF5] text-[#0F766E]'
      }`}
    >
      <KeyRound className={iconClass} />
    </span>
  );
};

export const UnifiedWalletList: React.FC<UnifiedWalletListProps> = ({
  wallets,
  mode,
  selectedWalletId,
  activeSession = null,
  busy = false,
  compact = false,
  theme = 'light',
  onSelect,
}) => {
  const isDark = theme === 'dark';

  return (
    <div className="space-y-2.5">
      {wallets.map((w) => {
        const isActive = isWalletOptionActive(w, activeSession);
        const isSelected = mode === 'select' && w.id === selectedWalletId;
        const isDisabled = !w.available || busy || (mode === 'connect' && isActive);

        const rowSurface = isDark
          ? !w.available
            ? 'bg-white/[0.03] border-white/8 opacity-55 cursor-not-allowed'
            : isActive
              ? 'bg-emerald-500/15 border-emerald-400/40 cursor-default'
              : isSelected
                ? 'bg-[#F16A2E]/15 border-[#F16A2E] cursor-pointer'
                : 'bg-white/[0.05] border-white/10 hover:border-[#F16A2E]/80 hover:bg-white/[0.09] cursor-pointer disabled:opacity-60'
          : !w.available
            ? 'bg-[#FAF6F3] border-[#F0E6DF] opacity-65 cursor-not-allowed'
            : isActive
              ? 'bg-[#ECFDF5] border-[#86EFAC] cursor-default'
              : isSelected
                ? 'bg-[#FFF3EC] border-[#F16A2E] shadow-xs cursor-pointer'
                : 'bg-white border-[#EAE0D8] hover:border-[#F16A2E] hover:bg-[#FFFBF8] cursor-pointer disabled:opacity-60';

        return (
          <button
            key={w.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(w.id)}
            className={`group w-full text-left rounded-2xl border transition-all flex items-center justify-between gap-3 ${
              compact ? 'min-h-[54px] px-3.5 py-2.5' : 'min-h-[66px] px-4 py-3.5'
            } ${rowSurface}`}
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <WalletBrandIcon
                option={w}
                isActive={isActive}
                isSelected={isSelected}
                theme={theme}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                  <span
                    className={`font-bold truncate ${
                      isDark ? 'text-white' : 'text-[#111114]'
                    } ${compact ? 'text-xs' : 'text-sm'}`}
                  >
                    {w.name}
                  </span>
                  {!compact && w.kind === 'pollar' && w.available && !isActive && (
                    <span className="text-[11px] font-bold text-[#F16A2E] whitespace-nowrap">
                      · Recommended
                    </span>
                  )}
                </div>
                <p
                  className={`mt-0.5 leading-snug ${
                    isDark ? 'text-white/65' : 'text-[#5E5854]'
                  } ${compact ? 'text-[11px] line-clamp-1' : 'text-xs line-clamp-2'}`}
                >
                  {w.description}
                </p>
                {!compact && (
                  <div
                    className={`text-[11px] font-medium mt-1 truncate ${
                      isDark ? 'text-white/45' : 'text-[#8A827D]'
                    }`}
                  >
                    {getWalletCapabilityLine(w)}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
              {busy && !isActive && isSelected ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
              ) : isActive ? (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold whitespace-nowrap ${
                    isDark ? 'text-[#4ADE80]' : 'text-[#15803D]'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Connected</span>
                </span>
              ) : !w.available ? (
                <span
                  className={`text-[11px] font-semibold whitespace-nowrap ${
                    isDark ? 'text-white/45' : 'text-[#877F7A]'
                  }`}
                >
                  Android Chrome
                </span>
              ) : isSelected ? (
                <CheckCircle2 className="w-5 h-5 text-[#F16A2E]" />
              ) : activeSession ? (
                <span className="text-[11px] font-bold text-[#F16A2E] whitespace-nowrap">
                  Switch
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold transition-colors whitespace-nowrap ${
                    isDark
                      ? 'text-white/90 group-hover:text-[#F16A2E]'
                      : 'text-[#111114] group-hover:text-[#F16A2E]'
                  }`}
                >
                  <span>
                    {w.kind === 'pollar'
                      ? 'Continue'
                      : w.kind === 'mwa'
                        ? 'Pair'
                        : w.kind === 'browser-vault'
                          ? 'Start'
                          : 'Connect'}
                  </span>
                  <ChevronRight
                    className={`w-4 h-4 transition-all group-hover:translate-x-0.5 ${
                      isDark
                        ? 'text-white/45 group-hover:text-[#F16A2E]'
                        : 'text-[#8A827D] group-hover:text-[#F16A2E]'
                    }`}
                  />
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
