import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

interface ScrollableCalendarStripProps {
  nowMs: number;
  streakDays: number;
  activeStakeCount: number;
  selectedDateIso?: string | null;
  onSelectDate?: (isoDate: string) => void;
}

interface CalendarDayItem {
  isoKey: string; // YYYY-MM-DD
  monthKey: string; // YYYY-MM
  year: number;
  monthIndex: number; // 0-11
  dateNum: number;
  dayShort: string;
  monthShort: string;
  monthLong: string;
  isFirstOfMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  completed: boolean;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function toIsoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function formatMonthTitle(monthKey: string): string {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr);
  const mIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  return `${MONTH_LONG[mIdx]} ${y}`;
}

export const ScrollableCalendarStrip: React.FC<ScrollableCalendarStripProps> = ({
  nowMs,
  streakDays,
  activeStakeCount,
  selectedDateIso,
  onSelectDate,
}) => {
  const todayDate = useMemo(() => {
    const d = new Date(nowMs);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }, [Math.floor(nowMs / 60_000)]);

  const todayIso = useMemo(() => toIsoDateKey(todayDate), [todayDate]);
  const todayMonthKey = useMemo(
    () => toMonthKey(todayDate.getFullYear(), todayDate.getMonth()),
    [todayDate]
  );

  // Center window around an anchor month offset so scrolling or arrows can traverse a full 13-month span
  const [anchorMonthOffset, setAnchorMonthOffset] = useState(0);
  const [visibleMonthKey, setVisibleMonthKey] = useState<string>(todayMonthKey);
  const [internalSelectedIso, setInternalSelectedIso] = useState<string>(todayIso);

  const activeSelectedIso = selectedDateIso ?? internalSelectedIso;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const dayNodeMapRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const monthStartNodeMapRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasInitialCenteredRef = useRef(false);
  const rafScrollRef = useRef<number | null>(null);

  // Desktop drag-to-scroll state
  const dragStateRef = useRef<{
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  }>({
    isDown: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });

  // Build 13 continuous months (6 months before anchor through 6 months after anchor)
  const { days, monthKeys } = useMemo(() => {
    const startMonth = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth() + anchorMonthOffset - 6,
      1
    );
    const endMonthExclusive = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth() + anchorMonthOffset + 7,
      1
    );

    const items: CalendarDayItem[] = [];
    const seenMonths: string[] = [];
    const todayStartMs = todayDate.getTime();
    const clampedStreak = Math.max(0, Math.min(streakDays, 180));

    const cursor = new Date(startMonth.getTime());
    while (cursor < endMonthExclusive) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const dNum = cursor.getDate();
      const isoKey = toIsoDateKey(cursor);
      const monthKey = toMonthKey(y, m);
      if (dNum === 1) {
        seenMonths.push(monthKey);
      }

      const diffDays = Math.round((todayStartMs - cursor.getTime()) / 86_400_000);
      const isToday = diffDays === 0;
      const isPast = diffDays > 0;
      const completed = isPast && diffDays <= clampedStreak;

      items.push({
        isoKey,
        monthKey,
        year: y,
        monthIndex: m,
        dateNum: dNum,
        dayShort: WEEKDAY_SHORT[cursor.getDay()],
        monthShort: MONTH_SHORT[m],
        monthLong: MONTH_LONG[m],
        isFirstOfMonth: dNum === 1,
        isToday,
        isPast,
        completed,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    return { days: items, monthKeys: seenMonths };
  }, [todayDate, anchorMonthOffset, streakDays]);

  const scrollToDayNode = useCallback(
    (node: HTMLButtonElement | undefined, behavior: ScrollBehavior = 'smooth', align: 'center' | 'start' = 'center') => {
      const container = scrollerRef.current;
      if (!container || !node) return;
      const containerRect = container.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const currentLeft = container.scrollLeft;
      const relativeLeft = nodeRect.left - containerRect.left + currentLeft;
      const targetLeft =
        align === 'center'
          ? relativeLeft - container.clientWidth / 2 + node.clientWidth / 2
          : relativeLeft - 12;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior,
      });
    },
    []
  );

  // Center Today on first mount without scrolling the page vertically
  useEffect(() => {
    if (hasInitialCenteredRef.current) return;
    const todayNode = dayNodeMapRef.current.get(todayIso);
    if (todayNode && scrollerRef.current) {
      scrollToDayNode(todayNode, 'auto', 'center');
      setVisibleMonthKey(todayMonthKey);
      hasInitialCenteredRef.current = true;
    }
  }, [days, todayIso, todayMonthKey, scrollToDayNode]);

  // Detect active month dynamically as the user scrolls horizontally on the x-axis
  const updateVisibleMonthFromScroll = useCallback(() => {
    const container = scrollerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    // Sample focal point ~35% across the visible horizontal track so crossing into a new month feels immediate
    const focalX = containerRect.left + containerRect.width * 0.35;

    let closestMonthKey: string | null = null;
    let smallestDist = Number.POSITIVE_INFINITY;

    dayNodeMapRef.current.forEach((node) => {
      const rect = node.getBoundingClientRect();
      // Skip nodes completely outside the scroll viewport for speed
      if (rect.right < containerRect.left - 80 || rect.left > containerRect.right + 80) {
        return;
      }
      const center = rect.left + rect.width / 2;
      const dist = Math.abs(center - focalX);
      if (dist < smallestDist) {
        smallestDist = dist;
        closestMonthKey = node.dataset.monthKey || null;
      }
    });

    if (closestMonthKey) {
      setVisibleMonthKey((prev) => (prev === closestMonthKey ? prev : closestMonthKey!));
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (rafScrollRef.current !== null) return;
    rafScrollRef.current = window.requestAnimationFrame(() => {
      rafScrollRef.current = null;
      updateVisibleMonthFromScroll();
    });
  }, [updateVisibleMonthFromScroll]);

  useEffect(() => {
    return () => {
      if (rafScrollRef.current !== null) {
        window.cancelAnimationFrame(rafScrollRef.current);
      }
    };
  }, []);

  const handleStepMonth = (delta: -1 | 1) => {
    const idx = monthKeys.indexOf(visibleMonthKey);
    const nextIdx = idx + delta;
    if (nextIdx >= 0 && nextIdx < monthKeys.length) {
      const targetMonth = monthKeys[nextIdx];
      setVisibleMonthKey(targetMonth);
      const firstDayNode = monthStartNodeMapRef.current.get(targetMonth);
      if (firstDayNode) {
        scrollToDayNode(firstDayNode, 'smooth', 'start');
      }
    } else {
      // Shift loaded window if user navigates past the 13-month span
      setAnchorMonthOffset((prev) => prev + delta * 3);
    }
  };

  const handleJumpToday = () => {
    if (anchorMonthOffset !== 0) {
      setAnchorMonthOffset(0);
    }
    setInternalSelectedIso(todayIso);
    onSelectDate?.(todayIso);
    setVisibleMonthKey(todayMonthKey);
    window.requestAnimationFrame(() => {
      const todayNode = dayNodeMapRef.current.get(todayIso);
      scrollToDayNode(todayNode, 'smooth', 'center');
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    dragStateRef.current = {
      isDown: true,
      startX: e.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || !dragStateRef.current.isDown) return;
    const dx = e.clientX - dragStateRef.current.startX;
    if (Math.abs(dx) > 5) {
      dragStateRef.current.moved = true;
    }
    el.scrollLeft = dragStateRef.current.startScrollLeft - dx;
  };

  const handleMouseUpOrLeave = () => {
    dragStateRef.current.isDown = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Allow smooth horizontal scroll from vertical wheel when hovering over the calendar strip
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  const selectedDayObj = useMemo(
    () => days.find((d) => d.isoKey === activeSelectedIso) || null,
    [days, activeSelectedIso]
  );

  const isViewingTodayMonth = visibleMonthKey === todayMonthKey;

  return (
    <section
      className="actake-card p-4 sm:p-5 space-y-3.5"
      aria-label="Scrollable monthly habit calendar"
    >
      {/* Calendar Header: Live Month Switcher + Today Button + Chevrons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-2xl bg-[#FFF2EA] text-[#F16A2E] flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-[#111114] tracking-tight truncate">
                {formatMonthTitle(visibleMonthKey)}
              </h2>
              {!isViewingTodayMonth && (
                <button
                  type="button"
                  onClick={handleJumpToday}
                  className="px-2.5 py-0.5 rounded-full bg-[#FFF2EA] hover:bg-[#F16A2E] text-[#F16A2E] hover:text-white text-[11px] font-bold transition-colors whitespace-nowrap"
                >
                  Today
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#6B6663] truncate">
              Scroll sideways to switch months ·{' '}
              {selectedDayObj
                ? selectedDayObj.isToday
                  ? `${activeStakeCount} active ${activeStakeCount === 1 ? 'stake' : 'stakes'} armed today`
                  : selectedDayObj.completed
                    ? `${selectedDayObj.monthShort} ${selectedDayObj.dateNum} · Verified streak day`
                    : selectedDayObj.isPast
                      ? `${selectedDayObj.monthShort} ${selectedDayObj.dateNum} · Past date`
                      : `${selectedDayObj.monthShort} ${selectedDayObj.dateNum} · Scheduled routine`
                : 'Tap any date to inspect'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF8F4] border border-[#F2E3DA] text-[11px] font-bold text-[#F16A2E] tabular-nums mr-1">
            <Flame className="w-3.5 h-3.5" />
            <span>{streakDays}d streak</span>
          </span>
          <button
            type="button"
            onClick={() => handleStepMonth(-1)}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-[#FFF8F4] border border-[#EFE2D9] hover:border-[#F16A2E] hover:bg-[#FFF0E6] text-[#111114] flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleStepMonth(1)}
            aria-label="Next month"
            className="w-9 h-9 rounded-full bg-[#FFF8F4] border border-[#EFE2D9] hover:border-[#F16A2E] hover:bg-[#FFF0E6] text-[#111114] flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal X-Axis Scrollable Calendar Track */}
      <div className="relative">
        {/* Subtle edge fade masks to hint horizontal scrollability */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-white to-transparent z-10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-white to-transparent z-10"
        />

        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          onWheel={handleWheel}
          className="actake-no-scrollbar flex items-end gap-2 sm:gap-2.5 overflow-x-auto pb-1.5 pt-1 px-2 cursor-grab active:cursor-grabbing select-none"
        >
          {days.map((day) => {
            const isSelected = day.isoKey === activeSelectedIso;
            return (
              <React.Fragment key={day.isoKey}>
                {/* Crisp inline month divider whenever crossing into a new month */}
                {day.isFirstOfMonth && (
                  <div className="flex flex-col items-center justify-end shrink-0 self-stretch pb-2 px-1">
                    <span className="px-2 py-1 rounded-full bg-[#111114] text-white text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap">
                      {day.monthShort}
                    </span>
                    <div className="w-px flex-1 bg-[#EFE2D9] mt-1.5" />
                  </div>
                )}

                <button
                  type="button"
                  data-month-key={day.monthKey}
                  ref={(el) => {
                    if (el) {
                      dayNodeMapRef.current.set(day.isoKey, el);
                      if (day.isFirstOfMonth) {
                        monthStartNodeMapRef.current.set(day.monthKey, el);
                      }
                    } else {
                      dayNodeMapRef.current.delete(day.isoKey);
                      if (day.isFirstOfMonth) {
                        monthStartNodeMapRef.current.delete(day.monthKey);
                      }
                    }
                  }}
                  onClick={() => {
                    if (dragStateRef.current.moved) return;
                    setInternalSelectedIso(day.isoKey);
                    setVisibleMonthKey(day.monthKey);
                    onSelectDate?.(day.isoKey);
                  }}
                  className="flex flex-col items-center shrink-0 w-[56px] sm:w-[62px] group focus-visible:outline-none"
                >
                  <span
                    className={`text-[11px] font-semibold mb-1.5 transition-colors ${
                      day.isToday || isSelected ? 'text-[#111114]' : 'text-[#877F7A]'
                    }`}
                  >
                    {day.dayShort}
                  </span>

                  <div className="h-2 flex items-center justify-center mb-1">
                    {(day.isToday || isSelected) && (
                      <span
                        aria-hidden="true"
                        className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] ${
                          day.isToday ? 'border-t-[#F16A2E]' : 'border-t-[#111114]'
                        }`}
                      />
                    )}
                  </div>

                  <div
                    className={`w-full rounded-full py-2 px-1 flex flex-col items-center justify-between gap-1.5 min-h-[78px] sm:min-h-[82px] transition-all border ${
                      day.isToday
                        ? 'bg-[#F38452] border-[#E87340] text-white shadow-[0_10px_22px_rgba(241,106,46,0.34)]'
                        : isSelected
                          ? 'bg-[#111114] border-[#111114] text-white shadow-[0_8px_18px_rgba(17,17,20,0.18)]'
                          : 'bg-[#FFFDFB] border-[#EFE2D9] text-[#111114] group-hover:border-[#F16A2E]/55 group-hover:bg-[#FFF8F4]'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-display text-xs sm:text-sm font-bold tabular-nums transition-colors ${
                        day.isToday
                          ? 'bg-white text-[#111114]'
                          : isSelected
                            ? 'bg-white/15 text-white'
                            : day.completed
                              ? 'bg-[#E6F8EE] text-[#16A34A]'
                              : 'bg-[#FFF4EE] text-[#6B6663]'
                      }`}
                    >
                      {day.completed && !day.isToday && !isSelected ? (
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      ) : (
                        day.dateNum
                      )}
                    </span>

                    <span
                      className={`text-[10px] font-semibold ${
                        day.isToday
                          ? 'text-white'
                          : isSelected
                            ? 'text-white/85'
                            : day.completed
                              ? 'text-[#16A34A]'
                              : 'text-[#877F7A]'
                      }`}
                    >
                      {day.isToday ? 'Today' : day.completed ? 'Done' : 'Plan'}
                    </span>
                  </div>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
};
