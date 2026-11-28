import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, User, XCircle } from 'lucide-react';
import { shortenAddress } from '../solana/walletManager';

interface UsernameOnboardingModalProps {
  open: boolean;
  walletPubkey: string;
  initialUsername?: string;
  allowClose?: boolean;
  onClose?: () => void;
  onComplete: (username: string) => void;
}

const LOCAL_USERNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,23}$/;

export const UsernameOnboardingModal: React.FC<UsernameOnboardingModalProps> = ({
  open,
  walletPubkey,
  initialUsername = '',
  allowClose = false,
  onClose,
  onComplete,
}) => {
  const [input, setInput] = useState(initialUsername);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    checkedFor: string;
    available: boolean;
    reason?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setInput(initialUsername);
      setSubmitError(null);
      setAvailability(null);
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [open, initialUsername]);

  const cleaned = input.trim().replace(/^@+/, '');

  // Live debounced availability check against server registry
  useEffect(() => {
    if (!open) return;
    setSubmitError(null);

    if (!cleaned) {
      setChecking(false);
      setAvailability(null);
      return;
    }

    if (cleaned.length < 2) {
      setChecking(false);
      setAvailability({
        checkedFor: cleaned,
        available: false,
        reason: 'Use at least 2 characters.',
      });
      return;
    }

    if (!LOCAL_USERNAME_REGEX.test(cleaned)) {
      setChecking(false);
      setAvailability({
        checkedFor: cleaned,
        available: false,
        reason: 'Start with a letter or number; use letters, numbers, _, ., or -.',
      });
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = window.setTimeout(async () => {
      try {
        const resp = await fetch(
          `/api/profile/check?username=${encodeURIComponent(cleaned)}&walletPubkey=${encodeURIComponent(walletPubkey)}`
        );
        const data = (await resp.json()) as {
          available?: boolean;
          reason?: string;
        };
        if (cancelled) return;
        setAvailability({
          checkedFor: cleaned,
          available: Boolean(data.available),
          reason: data.reason,
        });
      } catch {
        if (!cancelled) {
          setAvailability(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cleaned, open, walletPubkey]);

  if (!open) return null;

  const isAvailable =
    Boolean(cleaned) &&
    LOCAL_USERNAME_REGEX.test(cleaned) &&
    (!availability || (availability.checkedFor === cleaned && availability.available));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!cleaned || cleaned.length < 2 || !LOCAL_USERNAME_REGEX.test(cleaned)) {
      setSubmitError('Pick a valid username (2–24 characters, letters, numbers, _, ., or -).');
      return;
    }

    setSubmitting(true);
    try {
      const resp = await fetch('/api/profile/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletPubkey,
          username: cleaned,
        }),
      });
      const data = (await resp.json()) as {
        profile?: { username: string };
        error?: string;
      };
      if (!resp.ok || !data.profile?.username) {
        throw new Error(data.error || 'Could not claim that username. Please try another.');
      }
      onComplete(data.profile.username);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to save username.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="username-onboarding-title"
      onClick={() => {
        if (allowClose && onClose) onClose();
      }}
      className="fixed inset-0 z-[80] bg-[#111114]/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[28px] bg-[#FAF7F3] border border-[#EFE2D9] shadow-2xl p-6 sm:p-7 space-y-5"
      >
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] mx-auto flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <div className="text-xs font-semibold text-[#F16A2E]">
            Wallet Connected · {shortenAddress(walletPubkey, 4)}
          </div>
          <h2
            id="username-onboarding-title"
            className="font-display text-2xl font-extrabold text-[#111114] tracking-tight"
          >
            What should we call you?
          </h2>
          <p className="text-xs text-[#6B6663] leading-relaxed">
            Pick a unique username for leaderboards, ratings, Track Pools, and community feeds.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="actake-username-input"
              className="block text-xs font-bold text-[#111114]"
            >
              Your unique username
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-sm font-mono font-bold text-[#877F7A] pointer-events-none">
                @
              </span>
              <input
                ref={inputRef}
                id="actake-username-input"
                type="text"
                autoComplete="username"
                maxLength={24}
                value={input}
                onChange={(e) => setInput(e.target.value.replace(/\s+/g, ''))}
                placeholder="e.g. sol_runner"
                className="w-full min-h-[50px] pl-9 pr-11 rounded-2xl bg-white border border-[#EFE2D9] focus:border-[#F16A2E] focus:outline-none text-sm font-semibold text-[#111114] placeholder:text-[#A09A96]"
              />
              <div className="absolute right-3.5 flex items-center">
                {checking ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#F16A2E]" />
                ) : availability && availability.checkedFor === cleaned ? (
                  availability.available ? (
                    <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[#DC2626]" />
                  )
                ) : null}
              </div>
            </div>

            {availability && availability.checkedFor === cleaned && (
              <div
                className={`text-xs font-medium ${
                  availability.available ? 'text-[#16A34A]' : 'text-[#DC2626]'
                }`}
              >
                {availability.available
                  ? `@${cleaned} is available!`
                  : availability.reason || 'That username is already taken.'}
              </div>
            )}
          </div>

          {submitError && (
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] px-4 py-3 text-xs font-medium text-[#DC2626]">
              {submitError}
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-1">
            {allowClose && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[48px] px-5 rounded-full bg-white border border-[#EFE2D9] hover:border-[#111114] text-xs font-bold text-[#111114]"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || checking || !isAvailable}
              className="flex-1 min-h-[50px] px-6 rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Username...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Continue as @{cleaned || 'you'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
