import React, { useState } from 'react';
import {
  ArrowDownLeft,
  Check,
  Copy,
  LogOut,
  QrCode,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import {
  DevnetSyncState,
  DiscoveredWalletOption,
  PlatformCompatibility,
  WalletSession,
} from '../types/actake';
import { buildSquadBlinkUrl } from '../solana/actakeEscrow';
import { useActakePollar } from '../context/ActakePollarProvider';

interface WalletSheetProps {
  wallet: WalletSession;
  wallets: DiscoveredWalletOption[];
  platform: PlatformCompatibility;
  devnet: DevnetSyncState;
  onRefreshDevnet: () => void;
  onOpenPollarFund: () => void;
  onSwitchWallet: (walletId: string) => Promise<void>;
  onDisconnect: () => void;
  onClose: () => void;
}

export const WalletSheet: React.FC<WalletSheetProps> = ({
  wallet,
  wallets,
  platform,
  devnet,
  onRefreshDevnet,
  onOpenPollarFund,
  onSwitchWallet,
  onDisconnect,
  onClose,
}) => {
  const pollar = useActakePollar();
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [copiedBlink, setCopiedBlink] = useState(false);
  const [switching, setSwitching] = useState(false);

  const personalBlinkUrl = buildSquadBlinkUrl({
    squadName: 'Actake Daily Accountability',
    amount: 10,
    token: 'USDC',
    alarmTime: '06:30 AM',
  });

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet.publicKey);
      setCopiedAddr(true);
      window.setTimeout(() => setCopiedAddr(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleShareBlink = async () => {
    try {
      await navigator.clipboard.writeText(personalBlinkUrl);
      setCopiedBlink(true);
      window.setTimeout(() => setCopiedBlink(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSwitch = async (id: string) => {
    setSwitching(true);
    try {
      await onSwitchWallet(id);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-sheet-title"
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#FAF7F3] border border-[#EAE4DC] p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Wallet className="w-5 h-5 text-[#EC6B3F]" />
            <h2 id="wallet-sheet-title" className="font-display text-lg font-bold text-[#181E25]">
              Solana Wallet &amp; Pollar
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet sheet"
            className="min-h-[40px] min-w-[40px] rounded-full bg-white border border-[#EAE4DC] flex items-center justify-center text-[#181E25]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Connected Address & Live Devnet SOL / Pollar USDC */}
        <div className="rounded-2xl bg-white border border-[#EAE4DC] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#181E25]">{wallet.walletName}</span>
            <span className="text-[11px] font-mono text-[#1D8348] font-semibold">
              {wallet.chain}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyAddress}
            className="w-full rounded-xl bg-[#FAF7F3] border border-[#EFEAE3] px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:border-[#DDD5CA]"
          >
            <span className="font-mono text-xs text-[#181E25] truncate">{wallet.publicKey}</span>
            {copiedAddr ? (
              <Check className="w-4 h-4 text-[#1D8348] shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-[#5E6873] shrink-0" />
            )}
          </button>

          <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div>
              <div className="text-[#646F7C]">
                {wallet.connectionKind === 'pollar' && pollar.solanaBalances.usdc !== null
                  ? 'Pollar USDC Balance'
                  : 'Devnet SOL Balance'}
              </div>
              <div className="font-mono font-bold text-sm text-[#181E25] tabular-nums mt-0.5">
                {wallet.connectionKind === 'pollar' && pollar.solanaBalances.usdc !== null
                  ? `$${pollar.solanaBalances.usdc.toFixed(2)} USDC`
                  : devnet.solBalance !== null
                    ? `${devnet.solBalance.toFixed(4)} SOL`
                    : '—'}
              </div>
            </div>
            <div>
              <div className="text-[#646F7C]">Confirmed Slot</div>
              <div className="font-mono font-bold text-sm text-[#181E25] tabular-nums mt-0.5">
                {devnet.slot !== null ? devnet.slot.toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#F3EEE8]">
            <span className="text-[11px] text-[#5E6873] inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1D8348]" />
              {wallet.connectionKind === 'pollar'
                ? `Pollar ${wallet.pollarCustody || 'wallet'} session active`
                : 'SIWS authToken cached'}
            </span>
            <button
              type="button"
              onClick={() => {
                onRefreshDevnet();
                if (pollar.isAuthenticated) {
                  void pollar.refreshWalletBalance(true);
                }
              }}
              disabled={devnet.syncing}
              className="text-xs font-semibold text-[#EC6B3F] inline-flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${devnet.syncing ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Pollar Quick Funding Actions */}
        <div className="rounded-2xl bg-[#141416] text-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>Fund Wallet with Pollar</span>
            </span>
            <span className="text-[10px] font-mono text-white/60">
              {pollar.configured ? (pollar.isAuthenticated ? 'Live' : 'Sign In') : 'Setup Needed'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (pollar.configured && pollar.isAuthenticated) {
                  pollar.openRampModal();
                } else {
                  onOpenPollarFund();
                }
              }}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Fiat Ramp</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (pollar.configured && pollar.isAuthenticated) {
                  pollar.openReceiveModal();
                } else {
                  onOpenPollarFund();
                }
              }}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-white/12 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Receive QR</span>
            </button>
          </div>
        </div>

        {/* Cross-Platform Wallet Switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#181E25]">Sign-In &amp; Wallet Providers</span>
            <span className="text-[#646F7C] inline-flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5" />
              {platform.mwaSupported ? 'MWA Ready' : `${platform.os} web`}
            </span>
          </div>
          <div className="space-y-1.5">
            {wallets.map((w) => (
              <button
                key={w.id}
                type="button"
                disabled={!w.available || switching}
                onClick={() => handleSwitch(w.id)}
                className="w-full text-left rounded-xl bg-white border border-[#EAE4DC] hover:border-[#EC6B3F] disabled:opacity-50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs transition-colors"
              >
                <span className="font-semibold text-[#181E25] truncate">{w.name}</span>
                <span className="text-[#646F7C] shrink-0">
                  {!w.available
                    ? 'Android Chrome'
                    : w.kind === 'pollar'
                      ? 'Auth / Fund'
                      : 'Connect'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleShareBlink}
            className="w-full min-h-[44px] rounded-xl bg-[#181E25] hover:bg-[#26303B] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {copiedBlink ? <Check className="w-4 h-4 text-[#86EFAC]" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedBlink ? 'Solana Blink Invite Copied' : 'Copy Solana Blink Squad Invite'}</span>
          </button>

          <button
            type="button"
            onClick={onDisconnect}
            className="w-full min-h-[44px] rounded-xl bg-white border border-[#FECACA] text-[#991B1B] hover:bg-[#FEF2F2] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect Wallet &amp; Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
