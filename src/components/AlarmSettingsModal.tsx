import React, { useEffect } from 'react';
import { Check, Play, ShieldAlert, Volume2, X } from 'lucide-react';
import { AlarmSettings, AlarmSoundId } from '../types/actake';
import { ALARM_SOUNDS, alarmAudio } from '../utils/alarmAudio';

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
  useEffect(() => {
    return () => {
      alarmAudio.stop();
    };
  }, []);

  const handleSelectAndAudition = (soundId: AlarmSoundId) => {
    onChange({ ...settings, selectedSound: soundId });
    alarmAudio.preview(soundId, settings.volume);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-settings-title"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-md rounded-3xl bg-[#FAF7F3] border border-[#EAE4DC] p-6 space-y-5 shadow-2xl my-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="alarm-settings-title"
              className="font-display text-xl font-bold text-[#181E25]"
            >
              Loud Alarms
            </h2>
            <p className="text-xs text-[#5E6873] mt-0.5">
              No excuses. Pick your wake-up alarm tone and strictness rules.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              alarmAudio.stop();
              onClose();
            }}
            aria-label="Close alarm settings"
            className="min-h-[40px] min-w-[40px] rounded-full bg-white border border-[#EAE4DC] flex items-center justify-center text-[#181E25] hover:bg-[#F3EEE8]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alarm Sound List matching Loud Alarms screenshot */}
        <div className="space-y-2.5">
          {ALARM_SOUNDS.map((sound) => {
            const active = settings.selectedSound === sound.id;
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
                className={`w-full rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer transition-all border ${
                  active
                    ? 'bg-white border-[#1D8348] shadow-md scale-[1.01]'
                    : 'bg-[#F1ECE6] border-transparent hover:border-[#DDD5CA]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#181E25]">{sound.label}</div>
                  <div className="text-xs text-[#5E6873] truncate">{sound.tagline}</div>
                </div>

                {active ? (
                  <div className="w-8 h-8 rounded-full bg-[#22A559] text-white flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" strokeWidth={3} />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Preview ${sound.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      alarmAudio.preview(sound.id, settings.volume);
                    }}
                    className="w-8 h-8 rounded-full bg-[#181E25]/10 text-[#181E25] hover:bg-[#181E25]/20 flex items-center justify-center shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Volume Slider */}
        <div className="rounded-2xl bg-white border border-[#EAE4DC] p-4 flex items-center gap-3">
          <Volume2 className="w-4 h-4 text-[#181E25] shrink-0" />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-semibold text-[#181E25] mb-1">
              <span>Alarm Volume</span>
              <span className="font-mono tabular-nums">{Math.round(settings.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) })}
              className="w-full accent-[#EC6B3F] cursor-pointer"
            />
          </div>
        </div>

        {/* Strictness Penalty Toggle */}
        <div className="rounded-2xl bg-white border border-[#EAE4DC] p-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-[#181E25] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#EC6B3F]" />
              <span>Strictness</span>
            </div>
            <p className="text-xs text-[#5E6873] leading-relaxed">
              Disable snooze &amp; require exit confirmation · Auto-slash stake if unverified within
              10 mins.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.strictMode}
            onClick={() => onChange({ ...settings, strictMode: !settings.strictMode })}
            className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center shrink-0 mt-1 ${
              settings.strictMode ? 'bg-[#EC6B3F] justify-end' : 'bg-[#D6CFC6] justify-start'
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white shadow-xs" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            alarmAudio.stop();
            onClose();
          }}
          className="w-full min-h-[50px] rounded-full bg-[#EC6B3F] hover:bg-[#D95B31] text-white font-bold text-sm transition-colors"
        >
          Set as Alarm
        </button>
      </div>
    </div>
  );
};
