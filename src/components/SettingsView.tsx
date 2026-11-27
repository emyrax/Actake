import React, { useState } from 'react';
import {
  Activity,
  BellRing,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  ListChecks,
  LogOut,
  Plus,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wallet,
} from 'lucide-react';
import { AlarmSettings, StakeCommitment, WalletSession } from '../types/actake';
import { shortenAddress } from '../solana/walletManager';
import { formatClockTime12h } from '../utils/timeUtils';
import { ALARM_SOUNDS } from '../utils/alarmAudio';
import { MascotDisplay } from './MascotDisplay';
import { ConfirmDialog } from './UiPrimitives';

interface SettingsViewProps {
  wallet: WalletSession;
  stakes: StakeCommitment[];
  alarmSettings: AlarmSettings;
  streakDays: number;
  actPoints: number;
  onOpenWalletSheet: () => void;
  onOpenReadinessDrawer: () => void;
  onOpenAlarmSettings: () => void;
  onOpenCreateStake: () => void;
  onTriggerTestAlarm: (stake: StakeCommitment) => void;
  onDisconnectWallet: () => void;
}

const FAQ_ITEMS = [
  {
    q: 'Why does the camera target stay hidden until my alarm rings?',
    a: 'Actake generates a cryptographically randomized everyday object or workout move at alarm time so nobody can pre-stage a photo the night before.',
  },
  {
    q: 'How does the 0% Protocol Fee SKR perk work?',
    a: 'Staking with Token-2022 $SKR waives the 1.5% USDC protocol fee and awards 2x $ACT points on every verified check-in.',
  },
  {
    q: 'What happens if I sleep through my deadline?',
    a: 'Missed stakes are slashed from the escrow pool and split proportionally among squadmates who verified before the cutoff.',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  wallet,
  stakes,
  alarmSettings,
  streakDays,
  actPoints,
  onOpenWalletSheet,
  onOpenReadinessDrawer,
  onOpenAlarmSettings,
  onOpenCreateStake,
  onTriggerTestAlarm,
  onDisconnectWallet,
}) => {
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const activeStakes = stakes.filter((s) => s.status === 'locked' || s.status === 'ringing');
  const soundLabel =
    ALARM_SOUNDS.find((a) => a.id === alarmSettings.selectedSound)?.label || 'Siren';

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      {/* Profile Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="medallion"
            size="md"
            alt="Actake Profile Mascot"
          />
          <div className="min-w-0">
            <div className="text-xs font-medium text-[#6B6663]">Connected Profile</div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#111114] tracking-tight truncate">
              {wallet.walletName}
            </h1>
            <div className="text-xs font-mono text-[#6B6663] tabular-nums truncate">
              {shortenAddress(wallet.publicKey, 6)} · {streakDays}d streak ·{' '}
              {actPoints.toLocaleString()} $ACT
            </div>
          </div>
        </div>
      </div>

      {/* Seeker SKR 0% Fee Perk Banner */}
      <div className="actake-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4 min-w-0">
          <MascotDisplay
            variant="stage"
            size="lg"
            floating
            alt="Actake Seeker SKR Perk Mascot"
          />
          <div className="space-y-1.5 min-w-0">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#F16A2E]">
              <Sparkles className="w-4 h-4" />
              <span>Seeker Token-2022 Perk</span>
            </div>
            <div className="font-display text-2xl font-extrabold text-[#111114]">
              0% Protocol Fee on $SKR
            </div>
            <p className="text-xs text-[#6B6663] leading-relaxed">
              Stake with $SKR to waive protocol fees and earn 2x $ACT rewards on every verified
              deadline.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenCreateStake}
          className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          Stake with $SKR
        </button>
      </div>

      {/* Group 1: Account & Diagnostics */}
      <section className="space-y-2.5">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A] px-1">
          Account &amp; Diagnostics
        </h2>

        <button
          type="button"
          onClick={onOpenWalletSheet}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Profile &amp; Solana Wallet Vault
              </div>
              <div className="text-xs text-[#6B6663] truncate">
                Inspect connected pubkey, Devnet slot, Pollar Ramp &amp; MWA sessions
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
        </button>

        <button
          type="button"
          onClick={onOpenReadinessDrawer}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Devnet Setup &amp; Escrow Diagnostics
              </div>
              <div className="text-xs text-[#6B6663] truncate">
                Verify Supabase, RPC, Pollar API, copy Oracle pubkey &amp; airdrop Devnet SOL
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
        </button>
      </section>

      {/* Group 2: Alarms & Habits */}
      <section className="space-y-2.5">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A] px-1">
          Alarms &amp; Habits
        </h2>

        <div className="actake-card overflow-hidden">
          <button
            type="button"
            onClick={() => setHabitsOpen((v) => !v)}
            className="w-full min-h-[68px] px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-11 h-11 rounded-2xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center shrink-0">
                <ListChecks className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-[#111114]">
                  Manage Habits ({activeStakes.length} active)
                </div>
                <div className="text-xs text-[#6B6663]">
                  Review deadlines, motivation notes, and trigger alarm tests
                </div>
              </div>
            </div>
            {habitsOpen ? (
              <ChevronDown className="w-4 h-4 text-[#877F7A] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
            )}
          </button>

          {habitsOpen && (
            <div className="px-5 pb-4 pt-1 border-t border-[#F4ECE7] divide-y divide-[#F6EFEA]">
              {activeStakes.length === 0 ? (
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-xs text-[#6B6663]">
                    No active habit stakes right now. Lock your first daily deadline to arm an
                    alarm.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenCreateStake}
                    className="min-h-[40px] px-4 py-1.5 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create First Stake</span>
                  </button>
                </div>
              ) : (
                activeStakes.map((s) => {
                  const fmt = formatClockTime12h(s.alarmHour, s.alarmMinute);
                  return (
                    <div
                      key={s.id}
                      className="py-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#111114] truncate">{s.categoryName}</div>
                        <div className="text-[#6B6663] tabular-nums">
                          {fmt.full} · ${s.amount.toFixed(2)} {s.token}
                          {s.motivationNote ? ` · “${s.motivationNote}”` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTriggerTestAlarm(s)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <BellRing className="w-3.5 h-3.5" />
                        <span>Test</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenAlarmSettings}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
              <Volume2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#111114]">
                Alarm Sound &amp; Strict Mode
              </div>
              <div className="text-xs text-[#6B6663]">
                {soundLabel} · {alarmSettings.strictMode ? 'Strict Lock Enabled' : 'Standard Mode'}{' '}
                · {Math.round(alarmSettings.volume * 100)}% volume
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
        </button>
      </section>

      {/* Group 3: Support & Session */}
      <section className="space-y-2.5">
        <h2 className="font-display text-xs font-extrabold uppercase tracking-[0.12em] text-[#877F7A] px-1">
          Support &amp; Session
        </h2>

        <div className="actake-card overflow-hidden">
          <button
            type="button"
            onClick={() => setFaqOpen((v) => !v)}
            className="w-full min-h-[68px] px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FFF9F5] transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-11 h-11 rounded-2xl bg-[#ECFDF5] text-[#16A34A] flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-[#111114]">
                  Anti-Cheat &amp; Escrow FAQ
                </div>
                <div className="text-xs text-[#6B6663]">
                  How Gemini Vision, Ed25519 oracle proofs, and Solana slashing work
                </div>
              </div>
            </div>
            {faqOpen ? (
              <ChevronDown className="w-4 h-4 text-[#877F7A] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#877F7A] shrink-0" />
            )}
          </button>

          {faqOpen && (
            <div className="px-5 pb-4 pt-2 border-t border-[#F4ECE7] space-y-3">
              {FAQ_ITEMS.map((item) => (
                <div key={item.q} className="space-y-1">
                  <div className="text-xs font-bold text-[#111114] inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                    <span>{item.q}</span>
                  </div>
                  <p className="text-xs text-[#6B6663] leading-relaxed pl-5">{item.a}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setConfirmDisconnect(true)}
          className="w-full min-h-[68px] actake-card px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[#FEF2F2] transition-colors"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="font-display text-sm font-bold text-[#DC2626]">
                Disconnect Wallet &amp; Sign Out
              </div>
              <div className="text-xs text-[#6B6663]">
                End current SIWS session and return to onboarding
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[#DC2626]/60 shrink-0" />
        </button>
      </section>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Solana Wallet?"
        description="You will be signed out of your current Actake session and returned to onboarding. Your local stakes stay linked to this public key when you reconnect."
        confirmLabel="Disconnect"
        cancelLabel="Stay Signed In"
        destructive
        onCancel={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          onDisconnectWallet();
        }}
      />
    </div>
  );
};
