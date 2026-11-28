import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { GeoHuntRecord } from '../../types/geodrops';

interface GuideMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
}

interface HuntAiGuideDrawerProps {
  open: boolean;
  onClose: () => void;
  hunt: GeoHuntRecord;
  distanceMeters: number | null;
  cardinalDirection: string;
  turnCue: string;
  insideGeofence: boolean;
  experienceMode: 'idle' | 'live-real' | 'indoor-demo';
  /** Optional auto-prompt triggered when user taps "Ask AI for a Hint" from the map */
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
}

const QUICK_PROMPTS = [
  'Give me a hint',
  'How do I get there?',
  'What should I look for?',
  'How do I unlock it?',
];

type BrowserSpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export const HuntAiGuideDrawer: React.FC<HuntAiGuideDrawerProps> = ({
  open,
  onClose,
  hunt,
  distanceMeters,
  cardinalDirection,
  turnCue,
  insideGeofence,
  experienceMode,
  pendingPrompt,
  onPendingPromptConsumed,
}) => {
  const [messages, setMessages] = useState<GuideMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hey explorer! I am your AI Hunt Scout for ${hunt.title} near ${hunt.landmarkName}. Tap a hint below or talk to me for walking tips.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<InstanceType<BrowserSpeechRecognitionCtor> | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  const speechSupported = Boolean(getSpeechRecognitionCtor());

  // Reset greeting if hunt changes
  useEffect(() => {
    setMessages([
      {
        id: `welcome-${hunt.id}`,
        role: 'assistant',
        text: `Hey explorer! I am your AI Hunt Scout for ${hunt.title} near ${hunt.landmarkName}. Ask me for a hint or walking tip anytime.`,
      },
    ]);
  }, [hunt.id, hunt.title, hunt.landmarkName]);

  // Scroll to newest message smoothly
  useEffect(() => {
    if (open) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, open, loading]);

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    setLoadingVoiceId(null);
  };

  // Cleanup audio & mic on unmount or close
  useEffect(() => {
    if (!open) {
      stopSpeaking();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        setListening(false);
      }
    }
  }, [open]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const speakWithBrowserFallback = (text: string, msgId: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSpeakingMessageId(null);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.03;
      utterance.pitch = 1.0;
      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);
      setSpeakingMessageId(msgId);
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeakingMessageId(null);
    }
  };

  const speakReply = async (text: string, msgId: string) => {
    stopSpeaking();
    setLoadingVoiceId(msgId);

    try {
      const resp = await fetch('/api/hunts/ai-guide/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const data = (await resp.json()) as { audioBase64?: string; mimeType?: string };
      if (!resp.ok || !data.audioBase64) {
        setLoadingVoiceId(null);
        speakWithBrowserFallback(text, msgId);
        return;
      }

      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      audioRef.current = audio;
      setLoadingVoiceId(null);
      setSpeakingMessageId(msgId);

      audio.onended = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        setSpeakingMessageId(null);
      };
      audio.onerror = () => {
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        speakWithBrowserFallback(text, msgId);
      };

      await audio.play().catch(() => {
        speakWithBrowserFallback(text, msgId);
      });
    } catch {
      setLoadingVoiceId(null);
      speakWithBrowserFallback(text, msgId);
    }
  };

  const sendMessage = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || loading) return;

    stopSpeaking();
    const userMsg: GuideMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const nextHistory = [...messages.filter((m) => !m.isError), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/hunts/ai-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: trimmed,
          huntTitle: hunt.title,
          landmarkName: hunt.landmarkName,
          loreHint: hunt.loreHint,
          radiusMeters: hunt.radiusMeters,
          rewardPerChest: hunt.rewardPerChest,
          tokenSymbol: hunt.tokenSymbol,
          targetLat: hunt.targetLat,
          targetLng: hunt.targetLng,
          distanceMeters,
          cardinalDirection,
          turnCue,
          insideGeofence,
          experienceMode,
          arAssetKind: hunt.arAsset?.kind || 'chest',
          history: nextHistory.slice(-6).map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = (await resp.json()) as { reply?: string; error?: string };
      if (!resp.ok || !data.reply) {
        throw new Error(data.error || 'AI Hunt Scout could not reply right now.');
      }

      const aiMsgId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: aiMsgId,
          role: 'assistant',
          text: data.reply!,
        },
      ]);

      if (voiceEnabledRef.current) {
        void speakReply(data.reply, aiMsgId);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unable to reach AI Hunt Scout.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: errMsg,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Trigger auto-prompt if opened via "Ask AI for a Hint"
  useEffect(() => {
    if (open && pendingPrompt && !loading) {
      const prompt = pendingPrompt;
      onPendingPromptConsumed?.();
      void sendMessage(prompt);
    }
  }, [open, pendingPrompt]);

  const handleToggleMic = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    stopSpeaking();
    try {
      const recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        setListening(false);
        if (transcript) {
          void sendMessage(transcript);
        }
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);

      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="AI Hunt Scout Assistant"
      className="fixed inset-x-0 bottom-0 z-[70] flex justify-center pointer-events-none px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="pointer-events-auto w-full max-w-lg rounded-[26px] bg-[#141519]/96 border border-white/15 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col max-h-[68dvh]">
        {/* Drag Handle */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-9 h-9 rounded-full bg-[#F16A2E]/20 border border-[#F16A2E]/40 flex items-center justify-center text-lg shrink-0"
              aria-hidden="true"
            >
              🤖
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white leading-tight truncate">
                AI Hunt Scout
              </div>
              <div className="text-[11px] text-white/60 truncate">
                {speakingMessageId
                  ? 'Speaking live tips...'
                  : loadingVoiceId
                    ? 'Preparing voice...'
                    : listening
                      ? 'Listening to you...'
                      : `Live hints for ${hunt.landmarkName}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (voiceEnabled) stopSpeaking();
                setVoiceEnabled((v) => !v);
              }}
              aria-label={voiceEnabled ? 'Mute AI Scout voice' : 'Enable AI Scout voice'}
              className={`min-h-[40px] px-3 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                voiceEnabled
                  ? 'bg-[#F16A2E]/20 text-[#F4976C] border border-[#F16A2E]/40'
                  : 'bg-white/10 text-white/70 border border-white/10'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{voiceEnabled ? 'Voice On' : 'Muted'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close AI Hunt Scout"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message Feed */}
        <div className="px-4 py-3 overflow-y-auto space-y-2.5 flex-1">
          {messages.map((msg) => {
            const isSpeakingThis = speakingMessageId === msg.id;
            const isLoadingVoiceThis = loadingVoiceId === msg.id;
            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#F16A2E] text-white font-medium rounded-br-md'
                      : msg.isError
                        ? 'bg-red-950/80 border border-red-500/40 text-red-200 rounded-bl-md'
                        : 'bg-[#20222A] border border-white/10 text-white/95 rounded-bl-md'
                  }`}
                >
                  <p>{msg.text}</p>
                  {msg.role === 'assistant' && !msg.isError && (
                    <div className="mt-2 flex items-center">
                      <button
                        type="button"
                        onClick={() =>
                          isSpeakingThis ? stopSpeaking() : void speakReply(msg.text, msg.id)
                        }
                        className="text-[11px] font-semibold text-[#F4976C] hover:text-white inline-flex items-center gap-1 transition-colors"
                      >
                        {isLoadingVoiceThis ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Loading voice...</span>
                          </>
                        ) : isSpeakingThis ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop voice</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Play voice</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-[#20222A] border border-white/10 px-3.5 py-2.5 text-xs text-white/75 inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F16A2E]" />
                <span>Checking your route & landmark clues...</span>
              </div>
            </div>
          )}
          <div ref={feedEndRef} />
        </div>

        {/* 1-Tap Quick Hint Buttons */}
        <div className="px-4 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => void sendMessage(prompt)}
              className="min-h-[34px] px-3 rounded-full bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-white/90 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Row (Text + Voice Mic) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
          className="px-3 pb-3 pt-1 flex items-center gap-2 border-t border-white/10 bg-[#111216]"
        >
          {speechSupported && (
            <button
              type="button"
              onClick={handleToggleMic}
              aria-label={listening ? 'Stop voice input' : 'Talk to AI Hunt Scout'}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                listening
                  ? 'bg-[#EF4444] text-white'
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? 'Listening...' : 'Ask for a hint or directions...'}
            maxLength={400}
            className="flex-1 min-h-[44px] px-4 rounded-full bg-[#1E2028] border border-white/12 text-sm text-white placeholder:text-white/45 focus:outline-none focus:border-[#F16A2E]"
          />

          <button
            type="submit"
            disabled={loading || !input.trim()}
            aria-label="Send message to AI Hunt Scout"
            className="w-11 h-11 rounded-full bg-[#F16A2E] hover:bg-[#DC5A20] disabled:bg-white/12 disabled:text-white/40 text-white flex items-center justify-center shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
