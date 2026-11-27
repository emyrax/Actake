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
import { MascotDisplay } from './MascotDisplay';
import { ConfirmDialog } from './UiPrimitives';

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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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
    onClose();
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
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[#FFF8F4] border border-[#EFE2D9] p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MascotDisplay
              variant="medallion"
              size="xs"
              alt="Actake Wallet Mascot"
            />
            <div className="min-w-0">
              <h2 id="wallet-sheet-title" className="font-display text-lg font-extrabold text-[#111114]">
                Solana Wallet &amp; Pollar
              </h2>
              <div className="text-[11px] font-medium text-[#6B6663] inline-flex items-center gap-1">
                <Wallet className="w-3 h-3 text-[#F16A2E]" />
                <span>Actake Escrow Signer</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wallet sheet"
            className="w-11 h-11 rounded-full bg-white border border-[#EFE2D9] hover:bg-[#FFF0E6] flex items-center justify-center text-[#111114] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Connected Address & Live Devnet SOL / Pollar USDC */}
        <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#111114]">{wallet.walletName}</span>
            <span className="text-[11px] font-mono text-[#16A34A] font-bold">
              {wallet.chain}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void handleCopyAddress()}
            className="w-full min-h-[44px] rounded-xl bg-[#FFF8F4] border border-[#F2E3DA] px-3 py-2.5 flex items-center justify-between gap-2 text-left hover:border-[#F16A2E] transition-colors"
          >
            <span className="font-mono text-xs text-[#111114] truncate">{wallet.publicKey}</span>
            {copiedAddr ? (
              <Check className="w-4 h-4 text-[#16A34A] shrink-0" />
            ) : (
              <Copy className="w-4 h-4 text-[#6B6663] shrink-0" />
            )}
          </button>

          <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div>
              <div className="text-[#6B6663]">
                {wallet.connectionKind === 'pollar' && pollar.solanaBalances.usdc !== null
                  ? 'Pollar USDC Balance'
                  : 'Devnet SOL Balance'}
              </div>
              <div className="font-mono font-bold text-sm text-[#111114] tabular-nums mt-0.5">
                {wallet.connectionKind === 'pollar' && pollar.solanaBalances.usdc !== null
                  ? `$${pollar.solanaBalances.usdc.toFixed(2)} USDC`
                  : devnet.solBalance !== null
                    ? `${devnet.solBalance.toFixed(4)} SOL`
                    : '—'}
              </div>
            </div>
            <div>
              <div className="text-[#6B6663]">Confirmed Slot</div>
              <div className="font-mono font-bold text-sm text-[#111114] tabular-nums mt-0.5">
                {devnet.slot !== null ? devnet.slot.toLocaleString() : '—'}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#F4ECE7]">
            <span className="text-[11px] text-[#6B6663] inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" />
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
              className="min-h-[36px] px-2.5 rounded-full text-xs font-bold text-[#F16A2E] hover:bg-[#FFF0E6] inline-flex items-center gap-1 transition-colors"
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
              className="min-h-[44px] px-3 py-2 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
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
              className="min-h-[44px] px-3 py-2 rounded-full bg-white/12 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Receive QR</span>
            </button>
          </div>
        </div>

        {/* Cross-Platform Wallet Switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#111114]">Sign-In &amp; Wallet Providers</span>
            <span className="text-[#6B6663] inline-flex items-center gap-1">
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
                onClick={() => void handleSwitch(w.id)}
                className="w-full min-h-[44px] text-left rounded-2xl bg-white border border-[#EFE2D9] hover:border-[#F16A2E] disabled:opacity-50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs transition-colors"
              >
                <span className="font-bold text-[#111114] truncate">{w.name}</span>
                <span className="text-[#6B6663] shrink-0">
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
            onClick={() => void handleShareBlink()}
            className="w-full min-h-[46px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {copiedBlink ? <Check className="w-4 h-4 text-[#4ADE80]" /> : <Share2 className="w-4 h-4" />}
            <span>{copiedBlink ? 'Solana Blink Invite Copied' : 'Copy Solana Blink Squad Invite'}</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="w-full min-h-[46px] rounded-full bg-white border border-[#FECACA] text-[#DC2626] hover:bg-[#FEF2F2] text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Disconnect Wallet &amp; Sign Out</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Solana Wallet?"
        description="Sign out of this wallet session and return to Actake onboarding. Your staked habits remain associated with your public key."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        destructive
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          onDisconnect();
        }}
      />
    </div>
  );
};
