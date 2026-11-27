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
      <div className="w-full max-w-[1280px] mx-auto px-5 sm:px-8 h-[88px] flex items-center justify-between gap-6">
        {/* Left: Brand Logo */}
        <a
          href="#top"
          className="inline-flex items-center min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00] rounded-xl"
          aria-label="Actake Home"
        >
          <ActakeLogo />
        </a>

        {/* Center: Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-8 text-[15px] font-medium text-[#1E2430]"
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
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenConnect}
            className="actake-orange-cta min-h-[44px] px-6 sm:px-7 py-2.5 rounded-full text-[14px] sm:text-[15px] font-semibold text-white whitespace-nowrap transition-all active:scale-[0.98] cursor-pointer"
          >
            Download Now
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="lg:hidden min-h-[44px] min-w-[44px] rounded-full bg-white/60 hover:bg-white/85 backdrop-blur-md border border-white/70 flex items-center justify-center text-[#111318] transition-colors cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Drawer */}
      {mobileOpen && (
        <div className="lg:hidden absolute inset-x-4 top-[82px] rounded-[24px] bg-white/95 backdrop-blur-xl border border-white shadow-[0_24px_48px_rgba(17,19,24,0.14)] p-4 flex flex-col gap-1 z-50">
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
          <div className="pt-2 mt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenConnect();
              }}
              className="actake-orange-cta w-full min-h-[46px] rounded-full text-[15px] font-semibold text-white cursor-pointer"
            >
              Launch Actake Web Vault
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
