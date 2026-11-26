import { AlarmSoundId } from '../types/actake';

export interface AlarmSoundSpec {
  id: AlarmSoundId;
  label: string;
  tagline: string;
  intensityLabel: string;
}

export const ALARM_SOUNDS: AlarmSoundSpec[] = [
  { id: 'mayhem', label: 'Mayhem', tagline: 'Dual-tone discordant industrial klaxon', intensityLabel: 'Extreme' },
  { id: 'siren', label: 'Siren', tagline: 'Sweeping high-urgency emergency wail', intensityLabel: 'Max' },
  { id: 'rooster', label: 'Rooster', tagline: 'Sharp resonant morning crow harmonics', intensityLabel: 'Loud' },
  { id: 'baby', label: 'Baby Crying', tagline: 'Modulated rhythmic wake-up wail burst', intensityLabel: 'High' },
  { id: 'buzzer', label: 'Buzzer', tagline: 'Relentless square-wave shock pulse', intensityLabel: 'Max' },
];

class AlarmAudioEngine {
  private ctx: AudioContext | null = null;
  private loopTimer: number | null = null;
  private activeOscillators: Set<OscillatorNode> = new Set();
  private isRinging = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playPatternBurst(soundId: AlarmSoundId, volume: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    const clampedVol = Math.max(0.05, Math.min(0.65, volume * 0.45));
    gain.gain.setValueAtTime(0.001, now);
    gain.connect(ctx.destination);

    const registerOsc = (osc: OscillatorNode, stopTime: number) => {
      this.activeOscillators.add(osc);
      osc.onended = () => {
        this.activeOscillators.delete(osc);
      };
      osc.start(now);
      osc.stop(stopTime);
    };

    if (soundId === 'siren') {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(1280, now + 0.55);
      osc.frequency.exponentialRampToValueAtTime(620, now + 1.1);
      gain.gain.linearRampToValueAtTime(clampedVol, now + 0.08);
      gain.gain.setValueAtTime(clampedVol, now + 0.95);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.15);
      osc.connect(gain);
      registerOsc(osc, now + 1.18);
    } else if (soundId === 'mayhem') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'square';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, now);
      osc2.frequency.setValueAtTime(932, now);
      osc1.frequency.setValueAtTime(660, now + 0.25);
      osc2.frequency.setValueAtTime(710, now + 0.25);
      osc1.frequency.setValueAtTime(980, now + 0.5);
      osc2.frequency.setValueAtTime(1040, now + 0.5);
      gain.gain.linearRampToValueAtTime(clampedVol, now + 0.03);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.85);
      osc1.connect(gain);
      osc2.connect(gain);
      registerOsc(osc1, now + 0.88);
      registerOsc(osc2, now + 0.88);
    } else if (soundId === 'rooster') {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(1420, now + 0.18);
      osc.frequency.exponentialRampToValueAtTime(940, now + 0.34);
      osc.frequency.exponentialRampToValueAtTime(1580, now + 0.52);
      osc.frequency.exponentialRampToValueAtTime(720, now + 0.95);
      gain.gain.linearRampToValueAtTime(clampedVol * 1.1, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.98);
      osc.connect(gain);
      registerOsc(osc, now + 1.0);
    } else if (soundId === 'baby') {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.linearRampToValueAtTime(690, now + 0.35);
      osc.frequency.linearRampToValueAtTime(480, now + 0.85);
      lfo.frequency.setValueAtTime(7.5, now);
      lfoGain.gain.setValueAtTime(45, now);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      gain.gain.linearRampToValueAtTime(clampedVol * 0.9, now + 0.06);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.92);
      osc.connect(gain);
      registerOsc(osc, now + 0.95);
      registerOsc(lfo, now + 0.95);
    } else {
      // Buzzer
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      gain.gain.setValueAtTime(clampedVol, now);
      gain.gain.setValueAtTime(0.001, now + 0.18);
      gain.gain.setValueAtTime(clampedVol, now + 0.28);
      gain.gain.setValueAtTime(0.001, now + 0.46);
      gain.gain.setValueAtTime(clampedVol, now + 0.56);
      gain.gain.setValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      registerOsc(osc, now + 0.85);
    }
  }

  public preview(soundId: AlarmSoundId, volume = 0.7): void {
    this.stop();
    this.playPatternBurst(soundId, volume);
  }

  public startLoop(soundId: AlarmSoundId, volume = 0.85): void {
    this.stop();
    this.isRinging = true;
    this.playPatternBurst(soundId, volume);
    this.loopTimer = window.setInterval(() => {
      if (!this.isRinging) return;
      this.playPatternBurst(soundId, volume);
    }, 1350);
  }

  public stop(): void {
    this.isRinging = false;
    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    }
    this.activeOscillators.clear();
  }
}

export const alarmAudio = new AlarmAudioEngine();
