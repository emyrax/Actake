import React, { useEffect, useState } from 'react';
import { Check, Play, ShieldAlert, Volume2, X } from 'lucide-react';
import { AlarmSettings, AlarmSoundId } from '../types/actake';
import { ALARM_SOUNDS, alarmAudio } from '../utils/alarmAudio';
import { MascotDisplay } from './MascotDisplay';

interface AlarmSettingsModalProps {
  settings: AlarmSettings;
  onChange: (next: AlarmSettings) => void;
  onClose: () => void;
}

export const AlarmSettingsModal: React.FC<AlarmSettingsModalProps> = ({
  settings,
  onChange,
  onClose,
}) => {
  const [draft, setDraft] = useState<AlarmSettings>(settings);

  useEffect(() => {
    return () => {
      alarmAudio.stop();
    };
  }, []);

  const handleClose = () => {
    alarmAudio.stop();
    onClose();
  };

  const handleSelectAndAudition = (soundId: AlarmSoundId) => {
    setDraft((prev) => ({ ...prev, selectedSound: soundId }));
    alarmAudio.preview(soundId, draft.volume);
  };

  const handleSave = () => {
    alarmAudio.stop();
    onChange(draft);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-settings-title"
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-[#111114]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-[28px] sm:rounded-[28px] bg-[#FFF8F4] border border-[#EFE2D9] p-6 space-y-5 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MascotDisplay variant="medallion" size="xs" alt="Actake Alarm Mascot" />
            <div className="min-w-0">
              <h2
                id="alarm-settings-title"
                className="font-display text-xl font-extrabold text-[#111114]"
              >
                Loud Alarms
              </h2>
              <p className="text-xs text-[#6B6663] mt-0.5">
                Pick your wake-up alarm tone and strictness rules.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close alarm settings"
            className="w-11 h-11 rounded-full bg-white border border-[#EFE2D9] flex items-center justify-center text-[#111114] hover:bg-[#FFF0E6] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alarm Sound List */}
        <div className="space-y-2.5">
          {ALARM_SOUNDS.map((sound) => {
            const active = draft.selectedSound === sound.id;
            return (
              <div
                key={sound.id}
                onClick={() => handleSelectAndAudition(sound.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectAndAudition(sound.id);
                  }
                }}
                className={`w-full min-h-[60px] rounded-2xl px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-all border ${
                  active
                    ? 'bg-white border-[#F16A2E] shadow-sm'
                    : 'bg-white/70 border-[#EFE2D9] hover:border-[#DFC4B4]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#111114]">{sound.label}</div>
                  <div className="text-xs text-[#6B6663] truncate">{sound.tagline}</div>
                </div>

                {active ? (
                  <div className="w-9 h-9 rounded-full bg-[#16A34A] text-white flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Preview ${sound.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      alarmAudio.preview(sound.id, draft.volume);
                    }}
                    className="w-9 h-9 rounded-full bg-[#FFF2EA] text-[#F16A2E] hover:bg-[#F16A2E] hover:text-white flex items-center justify-center shrink-0 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Volume Slider */}
        <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-[#F16A2E] shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-bold text-[#111114] mb-1.5">
              <span>Alarm Volume</span>
              <span className="font-mono tabular-nums">{Math.round(draft.volume * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label="Alarm volume"
              min={0.2}
              max={1}
              step={0.05}
              value={draft.volume}
              onChange={(e) => setDraft((prev) => ({ ...prev, volume: Number(e.target.value) }))}
              className="w-full accent-[#F16A2E] cursor-pointer"
            />
          </div>
        </div>

        {/* Strictness Penalty Toggle */}
        <div className="rounded-2xl bg-white border border-[#EFE2D9] p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#111114] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#F16A2E]" />
              <span>Strict Mode</span>
            </div>
            <p className="text-xs text-[#6B6663] leading-relaxed">
              Disable snooze &amp; require exit confirmation · Auto-slash stake if unverified within
              10 mins.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={draft.strictMode}
            onClick={() => setDraft((prev) => ({ ...prev, strictMode: !prev.strictMode }))}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors flex items-center shrink-0 mt-0.5 ${
              draft.strictMode ? 'bg-[#F16A2E] justify-end' : 'bg-[#DDD3CC] justify-start'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-white shadow-xs" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="w-full min-h-[50px] rounded-full bg-[#111114] hover:bg-[#F16A2E] text-white font-bold text-sm transition-colors"
        >
          Save Alarm Preferences
        </button>
      </div>
    </div>
  );
};
