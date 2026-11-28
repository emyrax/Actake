import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MascotThemeId } from '../types/actake';

const MASCOT_THEME_STORAGE_KEY = 'actake_mascot_theme_v1';
const DEFAULT_MASCOT_THEME: MascotThemeId = 'playful-3d';

export interface MascotThemeOption {
  id: MascotThemeId;
  label: string;
  description: string;
}

export const MASCOT_THEME_OPTIONS: MascotThemeOption[] = [
  {
    id: 'modern-minimalist',
    label: 'Modern Minimalist',
    description: 'Clean geometric vector lines & flat matte surfaces',
  },
  {
    id: 'retro-pixel',
    label: 'Retro Pixel',
    description: 'Crisp 8-bit arcade sprite & stepped pixel frame',
  },
  {
    id: 'playful-3d',
    label: 'Playful 3D',
    description: 'Original dimensional studio render & soft aura',
  },
];

function isValidMascotTheme(value: unknown): value is MascotThemeId {
  return value === 'modern-minimalist' || value === 'retro-pixel' || value === 'playful-3d';
}

function loadStoredMascotTheme(): MascotThemeId {
  if (typeof window === 'undefined') return DEFAULT_MASCOT_THEME;
  try {
    const raw = window.localStorage.getItem(MASCOT_THEME_STORAGE_KEY);
    return isValidMascotTheme(raw) ? raw : DEFAULT_MASCOT_THEME;
  } catch {
    return DEFAULT_MASCOT_THEME;
  }
}

interface MascotThemeContextValue {
  mascotTheme: MascotThemeId;
  setMascotTheme: (theme: MascotThemeId) => void;
}

const MascotThemeContext = createContext<MascotThemeContextValue>({
  mascotTheme: DEFAULT_MASCOT_THEME,
  setMascotTheme: () => {},
});

export const MascotThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mascotTheme, setMascotThemeState] = useState<MascotThemeId>(() => loadStoredMascotTheme());

  const setMascotTheme = useCallback((next: MascotThemeId) => {
    setMascotThemeState(next);
    try {
      window.localStorage.setItem(MASCOT_THEME_STORAGE_KEY, next);
    } catch {
      // ignore storage quota errors
    }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MASCOT_THEME_STORAGE_KEY && isValidMascotTheme(e.newValue)) {
        setMascotThemeState(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(
    () => ({
      mascotTheme,
      setMascotTheme,
    }),
    [mascotTheme, setMascotTheme]
  );

  return <MascotThemeContext.Provider value={value}>{children}</MascotThemeContext.Provider>;
};

export function useMascotTheme(): MascotThemeContextValue {
  return useContext(MascotThemeContext);
}
