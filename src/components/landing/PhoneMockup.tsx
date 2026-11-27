import React, { useState } from 'react';
import { Bell, Flame, Play } from 'lucide-react';
import morningFocusImg from '../../assets/images/morning_focus_card_1795735509652.jpg';
import eveningCheckinImg from '../../assets/images/evening_checkin_card_1795735509813.jpg';
import phoneUserAvatar from '../../assets/images/phone_user_avatar_1795735510788.jpg';
import { STATUS_FACE_OPTIONS, StatusFaceIcon, StatusFaceKey } from './BrandIcons';
import { ThoughtCloud } from './ThoughtCloud';

interface PhoneMockupProps {
  onOpenConnect: () => void;
}

type CategoryTab = 'All' | 'Fitness' | 'Study' | 'Coding';

const CATEGORY_TABS: CategoryTab[] = ['All', 'Fitness', 'Study', 'Coding'];

interface PreviewRoutineCard {
  id: string;
  title: string;
  duration: string;
  stake: string;
  category: CategoryTab;
  image: string;
}

const PREVIEW_CARDS: PreviewRoutineCard[] = [
  {
    id: 'morning-focus',
    title: 'Morning Focus',
    duration: '15 min',
    stake: '10 USDC',
    category: 'Fitness',
    image: morningFocusImg,
  },
  {
    id: 'evening-checkin',
    title: 'Evening Check-In',
    duration: '25 min',
    stake: '15 SKR',
    category: 'Study',
    image: eveningCheckinImg,
  },
  {
    id: 'deep-ship',
    title: 'Ship Sprint',
    duration: '45 min',
    stake: '20 USDC',
    category: 'Coding',
    image: morningFocusImg,
  },
  {
    id: 'sunrise-walk',
    title: 'Sunrise Walk',
    duration: '20 min',
    stake: '5 SKR',
    category: 'Fitness',
    image: eveningCheckinImg,
  },
];

const INACTIVE_STATUS_BG: Record<StatusFaceKey, string> = {
  tired: 'bg-[#FF9E44]/95 border border-white/25',
  struggling: 'bg-[#FF851B]/95 border border-white/25',
  neutral: 'bg-[#8E96A4] border border-white/30',
  lockedIn: 'bg-[#FF9538]/95 border border-white/25',
};

export const PhoneMockup: React.FC<PhoneMockupProps> = ({ onOpenConnect }) => {
  const [selectedStatus, setSelectedStatus] = useState<StatusFaceKey>('lockedIn');
  const [activeTab, setActiveTab] = useState<CategoryTab>('All');
  const [bellMuted, setBellMuted] = useState(false);

  const visibleCards =
    activeTab === 'All'
      ? PREVIEW_CARDS.slice(0, 2)
      : [
          ...PREVIEW_CARDS.filter((c) => c.category === activeTab),
          ...PREVIEW_CARDS.filter((c) => c.category !== activeTab),
        ].slice(0, 2);

  const activeStatusMeta =
    STATUS_FACE_OPTIONS.find((opt) => opt.id === selectedStatus) ?? STATUS_FACE_OPTIONS[3];

  return (
    <div
      id="app-preview"
      className="relative w-[306px] sm:w-[330px] shrink-0 select-none"
      aria-label="Actake mobile app interactive preview"
    >
      {/* Titanium outer frame — meets bottom cleanly like the reference mockup */}
      <div className="rounded-t-[48px] bg-[#141416] p-[10px] pb-0 shadow-[0_32px_70px_rgba(17,19,24,0.30)] ring-1 ring-white/45 relative">
        {/* Subtle side hardware buttons */}
        <span
          aria-hidden="true"
          className="hidden sm:block absolute -left-[3px] top-[102px] w-[3px] h-7 rounded-l-sm bg-[#27272A]"
        />
        <span
          aria-hidden="true"
          className="hidden sm:block absolute -left-[3px] top-[142px] w-[3px] h-12 rounded-l-sm bg-[#27272A]"
        />
        <span
          aria-hidden="true"
          className="hidden sm:block absolute -right-[3px] top-[128px] w-[3px] h-14 rounded-r-sm bg-[#27272A]"
        />

        {/* Inner Display Viewport */}
        <div className="rounded-t-[39px] overflow-hidden bg-[#F8FAFC] relative">
          {/* Dynamic Island */}
          <div
            aria-hidden="true"
            className="absolute top-[11px] left-1/2 -translate-x-1/2 z-30 w-[86px] h-[24px] rounded-full bg-[#09090B] flex items-center justify-end px-2.5 shadow-inner"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#1C2232] ring-1 ring-white/10" />
          </div>

          {/* Vibrant Orange Top Header Banner */}
          <div
            className="relative rounded-b-[28px] px-4 pt-3.5 pb-6 text-white shadow-[0_10px_24px_rgba(255,107,0,0.22)]"
            style={{
              background: 'linear-gradient(180deg, #FF8E24 0%, #FF6B00 100%)',
            }}
          >
            {/* iOS Status Bar */}
            <div className="flex items-center justify-between px-2 text-[12px] font-semibold tracking-tight mb-4">
              <span className="tabular-nums">9:41</span>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {/* Cellular Signal */}
                <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
                  <rect x="0.5" y="7" width="2.5" height="3.5" rx="0.8" fill="white" />
                  <rect x="4.5" y="5" width="2.5" height="5.5" rx="0.8" fill="white" />
                  <rect x="8.5" y="2.8" width="2.5" height="7.7" rx="0.8" fill="white" />
                  <rect x="12.5" y="0.5" width="2.5" height="10" rx="0.8" fill="white" />
                </svg>
                {/* Wi-Fi */}
                <svg width="14" height="11" viewBox="0 0 15 11" fill="none">
                  <path
                    d="M1.2 3.8C4.8 0.9 10.2 0.9 13.8 3.8"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3.6 6.4C5.8 4.6 9.2 4.6 11.4 6.4"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx="7.5" cy="9.2" r="1.3" fill="white" />
                </svg>
                {/* Battery */}
                <svg width="22" height="11" viewBox="0 0 24 12" fill="none">
                  <rect
                    x="0.75"
                    y="1"
                    width="19.5"
                    height="10"
                    rx="3"
                    stroke="white"
                    strokeOpacity="0.85"
                    strokeWidth="1.2"
                  />
                  <rect x="2.6" y="2.8" width="15.8" height="6.4" rx="1.6" fill="white" />
                  <path d="M21.5 4.2V7.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* User Avatar + Thought Bubble + Bell Button */}
            <div className="flex items-center justify-between gap-1 mb-3.5 px-0.5">
              <div className="w-10 h-10 rounded-full border-2 border-white overflow-hidden shadow-sm shrink-0 bg-[#FFE4C4]">
                <img
                  src={phoneUserAvatar}
                  alt="Quinn profile avatar"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 flex justify-center -my-3">
                <ThoughtCloud
                  variant="white"
                  size="phone"
                  lines={['Hello, Quinn!']}
                  className="-rotate-[4deg]"
                />
              </div>

              <button
                type="button"
                onClick={() => setBellMuted((prev) => !prev)}
                aria-label={bellMuted ? 'Enable streak reminders' : 'Mute streak reminders'}
                className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 border border-white/25 flex items-center justify-center text-white transition-colors shrink-0 relative cursor-pointer"
              >
                <Bell className="w-[18px] h-[18px]" />
                {!bellMuted && (
                  <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </button>
            </div>

            {/* Prompt Heading */}
            <h2 className="text-[19px] sm:text-[20px] font-bold text-white text-center tracking-[-0.02em] mb-4">
              How&apos;s Your Streak Today?
            </h2>

            {/* 4-Icon Interactive Status Selector Row */}
            <div className="flex items-center justify-center gap-3">
              {STATUS_FACE_OPTIONS.map((option) => {
                const isSelected = selectedStatus === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelectedStatus(option.id)}
                    aria-label={`${option.label}: ${option.helper}`}
                    aria-pressed={isSelected}
                    className={`w-[46px] h-[46px] rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white shadow-[0_8px_18px_rgba(0,0,0,0.18)] scale-105'
                        : `${INACTIVE_STATUS_BG[option.id]} hover:scale-105`
                    }`}
                  >
                    <StatusFaceIcon kind={option.id} active={isSelected} />
                  </button>
                );
              })}
            </div>

            {/* Subtle status feedback label */}
            <p className="mt-2.5 text-center text-[11px] font-medium text-white/90">
              {activeStatusMeta.label} · {activeStatusMeta.helper}
            </p>
          </div>

          {/* Lower App Screen Body */}
          <div className="bg-[#F8FAFC] px-4 pt-4 pb-2">
            {/* Horizontal Category Filter Pills */}
            <div
              role="tablist"
              aria-label="Habit routine filters"
              className="flex items-center gap-2 mb-3.5 overflow-x-auto pb-0.5"
            >
              {CATEGORY_TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3.5 py-2 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#FF7A00] text-white shadow-[0_6px_14px_rgba(255,122,0,0.28)]'
                        : 'bg-white text-[#64748B] border border-slate-200/80 hover:border-orange-200 hover:text-[#111318]'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* 2-Column Routine Thumbnail Grid extending cleanly to bottom edge */}
            <div className="grid grid-cols-2 gap-2.5">
              {visibleCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={onOpenConnect}
                  className="group relative h-[102px] rounded-t-[18px] rounded-b-[6px] overflow-hidden bg-slate-200 text-left shadow-sm cursor-pointer"
                >
                  <img
                    src={card.image}
                    alt={card.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                  <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Flame className="w-2.5 h-2.5 text-[#FF9933]" />
                    {card.stake}
                  </div>
                  <div className="absolute inset-x-2.5 bottom-2 flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-white truncate leading-tight">
                        {card.title}
                      </p>
                      <p className="text-[10px] text-white/80 leading-tight">{card.duration}</p>
                    </div>
                    <span className="w-6 h-6 rounded-full bg-white text-[#111318] flex items-center justify-center shrink-0">
                      <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
