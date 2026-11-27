import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ActakeLogo } from './BrandIcons';

interface NavbarProps {
  onOpenConnect: () => void;
}

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Why Choose Us', href: '#why-choose-us' },
  { label: 'App Preview', href: '#app-preview' },
  { label: 'User Stories', href: '#user-stories' },
  { label: 'FAQ', href: '#faq' },
];

export const Navbar: React.FC<NavbarProps> = ({ onOpenConnect }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="relative z-40 w-full">
      <div className="w-full max-w-[1280px] mx-auto px-4 sm:px-8 h-[74px] sm:h-[88px] flex items-center justify-between gap-2 sm:gap-6">
        {/* Left: Brand Logo */}
        <a
          href="#top"
          className="inline-flex items-center min-h-[44px] shrink-0 origin-left scale-[0.88] sm:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] rounded-xl"
          aria-label="Actake Home"
        >
          <ActakeLogo />
        </a>

        {/* Center: Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-7 xl:gap-8 text-[15px] font-medium text-[#1E2430]"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="py-2 transition-colors hover:text-[#FF7A00] whitespace-nowrap"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right: Primary Orange CTA + Mobile Menu Button */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenConnect}
            className="actake-orange-cta min-h-[40px] sm:min-h-[44px] px-4 sm:px-7 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[15px] font-semibold text-white whitespace-nowrap transition-all active:scale-[0.98] cursor-pointer"
          >
            Try Web App
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="lg:hidden min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] rounded-full bg-white/70 hover:bg-white/90 backdrop-blur-md border border-white/80 flex items-center justify-center text-[#111318] transition-colors cursor-pointer shrink-0"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Drawer */}
      {mobileOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-[#111318]/20 backdrop-blur-[1px]"
          />
          <div className="lg:hidden absolute inset-x-4 top-[70px] sm:top-[82px] rounded-[24px] bg-white/98 backdrop-blur-xl border border-white shadow-[0_24px_48px_rgba(17,19,24,0.16)] p-4 flex flex-col gap-1 z-50">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="min-h-[44px] px-4 rounded-xl flex items-center text-[15px] font-semibold text-[#1E2430] hover:bg-[#FFF4E8] hover:text-[#FF7A00] transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2.5 mt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenConnect();
                }}
                className="actake-orange-cta w-full min-h-[46px] rounded-full text-[15px] font-semibold text-white cursor-pointer"
              >
                Try Web App
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
};
