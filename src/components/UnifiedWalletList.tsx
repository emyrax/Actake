import React from 'react';
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { DiscoveredWalletOption, WalletSession } from '../types/actake';

interface UnifiedWalletListProps {
  wallets: DiscoveredWalletOption[];
  mode: 'select' | 'connect';
  selectedWalletId?: string;
  activeSession?: WalletSession | null;
  busy?: boolean;
  compact?: boolean;
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

function getWalletIcon(kind: DiscoveredWalletOption['kind']) {
  if (kind === 'pollar') return Sparkles;
  if (kind === 'mwa') return Smartphone;
  if (kind === 'wallet-standard') return Wallet;
  return ShieldCheck;
}

export const UnifiedWalletList: React.FC<UnifiedWalletListProps> = ({
  wallets,
  mode,
  selectedWalletId,
  activeSession = null,
  busy = false,
  compact = false,
  onSelect,
}) => {
  return (
    <div className="space-y-2">
      {wallets.map((w) => {
        const isActive = isWalletOptionActive(w, activeSession);
        const isSelected = mode === 'select' && w.id === selectedWalletId;
        const isDisabled = !w.available || busy || (mode === 'connect' && isActive);
        const WalletIcon = getWalletIcon(w.kind);

        return (
          <button
            key={w.id}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(w.id)}
            className={`w-full text-left rounded-2xl border transition-colors flex items-center justify-between gap-3 ${
              compact ? 'min-h-[50px] px-3.5 py-2.5' : 'min-h-[58px] p-3.5'
            } ${
              !w.available
                ? 'bg-[#FFF8F4] border-[#F4EAE3] opacity-60 cursor-not-allowed'
                : isActive
                  ? 'bg-[#ECFDF5] border-[#86EFAC] cursor-default'
                  : isSelected
                    ? 'bg-[#FFF3EC] border-[#F16A2E] shadow-xs cursor-pointer'
                    : 'bg-white border-[#EFE3DB] hover:border-[#F16A2E] hover:bg-[#FFFBF8] cursor-pointer disabled:opacity-60'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isActive
                    ? 'bg-[#16A34A] text-white'
                    : isSelected && w.available
                      ? 'bg-[#F16A2E] text-white'
                      : 'bg-[#FFF4EE] text-[#F16A2E]'
                }`}
              >
                <WalletIcon className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`font-bold text-[#111114] truncate ${
                      compact ? 'text-xs' : 'text-sm'
                    }`}
                  >
                    {w.name}
                  </span>
                </div>
                <p
                  className={`text-[#6B6663] mt-0.5 leading-snug ${
                    compact ? 'text-[11px] line-clamp-1' : 'text-xs'
                  }`}
                >
                  {w.description}
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-1.5">
              {busy && !isActive && isSelected ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
              ) : isActive ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#15803D]">
                  <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                  <span>Connected</span>
                </span>
              ) : !w.available ? (
                <span className="text-[11px] font-semibold text-[#877F7A]">
                  Android Chrome
                </span>
              ) : isSelected ? (
                <CheckCircle2 className="w-5 h-5 text-[#F16A2E]" />
              ) : activeSession ? (
                <span className="text-[11px] font-bold text-[#F16A2E]">Switch</span>
              ) : (
                <span className="text-[11px] font-semibold text-[#6B6663]">
                  {w.kind === 'pollar'
                    ? 'Recommended'
                    : w.kind === 'mwa'
                      ? 'Seeker / MWA'
                      : w.kind === 'browser-vault'
                        ? 'Instant'
                        : 'Ready'}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
