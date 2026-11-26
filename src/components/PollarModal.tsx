import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  History,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import { useActakePollar } from '../context/ActakePollarProvider';
import { shortenAddress } from '../solana/walletManager';

interface PollarModalProps {
  mode: 'connect' | 'fund';
  onFallbackVault?: () => void;
  onClose: () => void;
}

export const PollarModal: React.FC<PollarModalProps> = ({
  mode,
  onFallbackVault,
  onClose,
}) => {
  const pollar = useActakePollar();
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const solAddress = pollar.solanaWallet?.address || pollar.wallet?.address || null;
  const isOriginBlocked =
    pollar.configured &&
    (pollar.configErrorCode === 'ORIGIN_NOT_ALLOWED' || pollar.configStatus === 'error');

  const handleCopyOrigin = async () => {
    if (!pollar.currentOrigin) return;
    try {
      await navigator.clipboard.writeText(pollar.currentOrigin);
      setCopiedOrigin(true);
      window.setTimeout(() => setCopiedOrigin(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleRetryPollar = async () => {
    setRetrying(true);
    try {
      const ok = await pollar.retryConfig();
      if (ok) {
        onClose();
        pollar.openLoginModal();
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pollar-modal-title"
      className="fixed inset-0 z-50 bg-[#111114]/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full max-w-md rounded-t-[30px] sm:rounded-[30px] bg-[#FFF8F4] border border-[#F2E2D8] p-6 space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F16A2E]">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pollar Protocol · Solana</span>
            </div>
            <h2
              id="pollar-modal-title"
              className="font-display text-xl font-extrabold text-[#111114] mt-0.5"
            >
              {mode === 'fund'
                ? 'Fund & Manage with Pollar'
                : 'Sign In & Pay with Pollar'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Pollar modal"
            className="w-9 h-9 rounded-full bg-white border border-[#EFE3DB] flex items-center justify-center text-[#111114] hover:bg-[#FFF2EA]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!pollar.configured ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-[#F0E3DB] p-4 space-y-3">
              <div className="text-xs font-bold text-[#111114]">
                Activate Live Pollar Sign-In, Fiat On-Ramp &amp; Solana Payments
              </div>
              <p className="text-xs text-[#6B6663] leading-relaxed">
                Pollar SDK (<code className="font-mono">@pollar/react</code> +{' '}
                <code className="font-mono">@pollar/solana-wallet-standard-adapter</code>) is wired
                into Actake. Add your publishable Pollar API key to enable live sign-in, fiat
                funding, and SPL stake payments:
              </p>

              <ol className="space-y-2 text-xs text-[#111114] list-decimal pl-4">
                <li>
                  Open{' '}
                  <a
                    href="https://dashboard.pollar.xyz"
                    target="_blank"
                    rel="noreferrer"
                    className="font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                  >
                    <span>dashboard.pollar.xyz</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  and create an application.
                </li>
                <li>
                  Under <strong>Wallet &amp; Chain Settings</strong>, enable{' '}
                  <strong>Solana</strong> (and Fiat Ramp / Passkeys / Email / Google login).
                </li>
                <li>
                  Copy your publishable API key and add{' '}
                  <code className="font-mono bg-[#FFF2EA] px-1.5 py-0.5 rounded text-[#111114]">
                    VITE_POLLAR_API_KEY
                  </code>{' '}
                  in the AI Studio Secrets panel.
                </li>
              </ol>
            </div>

            <div className="rounded-2xl bg-[#141416] text-white p-4 space-y-2">
              <div className="text-xs font-bold text-white">What Pollar unlocks in Actake</div>
              <ul className="space-y-1.5 text-[11px] text-white/80">
                <li className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#4ADE80] shrink-0" />
                  <span>One-tap Email OTP, Google, Passkey Smart Wallet &amp; Solana Wallets</span>
                </li>
                <li className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-[#F16A2E] shrink-0" />
                  <span>Built-in Fiat On-Ramp &amp; Crypto QR funding right inside Vault</span>
                </li>
                <li className="flex items-center gap-2">
                  <Wallet className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
                  <span>Sponsored SPL USDC/SKR stake payments directly to Actake escrow</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="https://dashboard.pollar.xyz"
                target="_blank"
                rel="noreferrer"
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Open Pollar Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {onFallbackVault && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFallbackVault();
                  }}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-full bg-[#111114] hover:bg-[#26262B] text-white text-xs font-bold transition-colors"
                >
                  Use Devnet Vault Now
                </button>
              )}
            </div>
          </div>
        ) : isOriginBlocked ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#991B1B]">
                <TriangleAlert className="w-4 h-4 shrink-0" />
                <span>
                  {pollar.configErrorCode === 'RATE_LIMITED'
                    ? 'Pollar API Temporarily Rate-Limited (429)'
                    : pollar.configErrorCode === 'INVALID_API_KEY'
                      ? 'Pollar API Key Rejected (401)'
                      : 'Whitelist This App URL in Pollar Dashboard (ORIGIN_NOT_ALLOWED)'}
                </span>
              </div>
              <p className="text-xs text-[#7F1D1D] leading-relaxed">
                {pollar.configErrorCode === 'RATE_LIMITED'
                  ? 'Pollar temporarily throttled requests from this browser session. Wait ~30 seconds, then tap Retry Pollar Sign-In below.'
                  : pollar.configErrorCode === 'INVALID_API_KEY'
                    ? 'Your VITE_POLLAR_API_KEY was rejected by Pollar. Verify you copied the publishable key (pub_testnet_... or pub_live_...) into AI Studio Secrets.'
                    : 'Your Pollar API key is detected, but Pollar blocked this browser origin with 403 ORIGIN_NOT_ALLOWED because this URL is not in your app’s Allowed Origins list yet.'}
              </p>
            </div>

            {pollar.currentOrigin &&
              pollar.configErrorCode !== 'INVALID_API_KEY' &&
              pollar.configErrorCode !== 'RATE_LIMITED' && (
              <div className="rounded-2xl bg-white border border-[#F0E3DB] p-4 space-y-3">
                <div className="text-xs font-bold text-[#111114]">
                  1. Copy this exact App Origin URL
                </div>
                <button
                  type="button"
                  onClick={handleCopyOrigin}
                  className="w-full rounded-xl bg-[#FFF8F4] border border-[#F2E2D8] hover:border-[#F16A2E] px-3 py-2.5 flex items-center justify-between gap-2 text-left transition-colors"
                >
                  <span className="font-mono text-[11px] text-[#111114] break-all">
                    {pollar.currentOrigin}
                  </span>
                  {copiedOrigin ? (
                    <Check className="w-4 h-4 text-[#16A34A] shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#F16A2E] shrink-0" />
                  )}
                </button>

                <ol className="space-y-1.5 text-xs text-[#6B6663] list-decimal pl-4">
                  <li>
                    Open{' '}
                    <a
                      href="https://dashboard.pollar.xyz"
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-[#F16A2E] hover:underline inline-flex items-center gap-1"
                    >
                      <span>dashboard.pollar.xyz</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>{' '}
                    → select your app → <strong>Developers / Allowed Origins (Websites)</strong>.
                  </li>
                  <li>
                    Paste the copied origin above and click <strong>Save</strong>.
                  </li>
                  <li>
                    Return here and tap <strong>Retry Pollar Sign-In</strong> below.
                  </li>
                </ol>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={retrying}
                onClick={handleRetryPollar}
                className="flex-1 min-h-[44px] px-4 py-2.5 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Checking Pollar...' : 'Retry Pollar Sign-In'}</span>
              </button>
              {onFallbackVault && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onFallbackVault();
                  }}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-full bg-[#111114] hover:bg-[#26262B] text-white text-xs font-bold transition-colors"
                >
                  Use Devnet Vault Now
                </button>
              )}
            </div>
          </div>
        ) : !pollar.isAuthenticated ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-[#F0E3DB] p-4 space-y-2">
              <p className="text-xs text-[#6B6663] leading-relaxed">
                Sign in with Pollar to create or connect your Solana wallet via Email, Google,
                Passkey, or installed Solana Wallet Standard wallets — then fund with fiat or
                crypto and pay Actake habit stakes directly.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                pollar.openLoginModal();
              }}
              className="w-full min-h-[48px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Wallet className="w-4 h-4" />
              <span>Continue with Pollar Sign-In</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Connected Pollar Solana Wallet Summary */}
            <div className="rounded-2xl bg-[#141416] text-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] text-white/60">Pollar Solana Wallet</div>
                  <div className="font-mono text-sm font-bold mt-0.5">
                    {solAddress ? shortenAddress(solAddress, 6) : 'Provisioning wallet...'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void pollar.refreshWalletBalance(true)}
                  disabled={pollar.solanaBalances.loading}
                  className="min-h-[34px] px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-[#F16A2E] ${
                      pollar.solanaBalances.loading ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs tabular-nums">
                <div className="rounded-xl bg-white/8 px-3 py-2">
                  <div className="text-[10px] text-white/60">Pollar USDC</div>
                  <div className="font-mono font-bold text-sm text-[#4ADE80]">
                    {pollar.solanaBalances.usdc !== null
                      ? `$${pollar.solanaBalances.usdc.toFixed(2)}`
                      : '—'}
                  </div>
                </div>
                <div className="rounded-xl bg-white/8 px-3 py-2">
                  <div className="text-[10px] text-white/60">Pollar SOL</div>
                  <div className="font-mono font-bold text-sm text-white">
                    {pollar.solanaBalances.sol !== null
                      ? `${pollar.solanaBalances.sol.toFixed(4)} SOL`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            {!pollar.hasWallet && (
              <button
                type="button"
                onClick={() => void pollar.createWallet()}
                className="w-full min-h-[44px] rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] text-white text-xs font-bold transition-colors"
              >
                Create Pollar Solana Wallet
              </button>
            )}

            {/* Native Pollar Funding & Transfer Launchers */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  pollar.openRampModal();
                }}
                className="rounded-2xl bg-white border border-[#F0E3DB] hover:border-[#F16A2E] p-3.5 text-left space-y-1.5 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4" />
                </span>
                <div className="font-display text-xs font-extrabold text-[#111114]">
                  Buy / Fiat Ramp
                </div>
                <p className="text-[11px] text-[#6B6663] leading-snug">
                  Fund wallet with card or local bank rails
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  pollar.openReceiveModal();
                }}
                className="rounded-2xl bg-white border border-[#F0E3DB] hover:border-[#F16A2E] p-3.5 text-left space-y-1.5 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
                  <QrCode className="w-4 h-4" />
                </span>
                <div className="font-display text-xs font-extrabold text-[#111114]">
                  Receive Crypto
                </div>
                <p className="text-[11px] text-[#6B6663] leading-snug">
                  Deposit SOL or USDC via Pollar QR
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  pollar.openSendModal();
                }}
                className="rounded-2xl bg-white border border-[#F0E3DB] hover:border-[#F16A2E] p-3.5 text-left space-y-1.5 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
                <div className="font-display text-xs font-extrabold text-[#111114]">
                  Send / Withdraw
                </div>
                <p className="text-[11px] text-[#6B6663] leading-snug">
                  Transfer funds out of Pollar wallet
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  pollar.openWalletBalanceModal();
                }}
                className="rounded-2xl bg-white border border-[#F0E3DB] hover:border-[#F16A2E] p-3.5 text-left space-y-1.5 transition-colors"
              >
                <span className="w-9 h-9 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </span>
                <div className="font-display text-xs font-extrabold text-[#111114]">
                  All Balances
                </div>
                <p className="text-[11px] text-[#6B6663] leading-snug">
                  Inspect Solana &amp; enabled tokens
                </p>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                pollar.openTxHistoryModal();
              }}
              className="w-full min-h-[42px] rounded-full bg-white border border-[#EFE3DB] hover:bg-[#FFF2EA] text-xs font-bold text-[#111114] inline-flex items-center justify-center gap-2 transition-colors"
            >
              <History className="w-3.5 h-3.5 text-[#F16A2E]" />
              <span>View Pollar Transaction History</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
