import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { FeaturesGridState, ScreenName } from '../types';

interface NavigationContextValue {
  current: ScreenName;
  historyLength: number;
  canGoBack: boolean;
  canGoForward: boolean;
  navigate: (name: ScreenName) => void;
  replace: (name: ScreenName) => void;
  goBack: () => void;
  goForward: () => void;
  restart: () => void;
  featuresGridState: FeaturesGridState;
  setFeaturesGridState: (state: FeaturesGridState) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  initialScreen = 'welcome',
  children,
}: {
  initialScreen?: ScreenName;
  children: React.ReactNode;
}) {
  const [history, setHistory] = useState<ScreenName[]>([initialScreen]);
  const [index, setIndex] = useState(0);
  const [featuresGridState, setFeaturesGridState] = useState<FeaturesGridState>('in-progress');

  const current = history[index];

  const navigate = useCallback(
    (name: ScreenName) => {
      setHistory((h) => [...h.slice(0, index + 1), name]);
      setIndex((i) => i + 1);
    },
    [index],
  );

  const replace = useCallback(
    (name: ScreenName) => {
      setHistory((h) => {
        const next = [...h];
        next[index] = name;
        return next;
      });
    },
    [index],
  );

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const goForward = useCallback(() => {
    setIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length]);

  const restart = useCallback(() => {
    setHistory([initialScreen]);
    setIndex(0);
    setFeaturesGridState('in-progress');
  }, [initialScreen]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      current,
      historyLength: history.length,
      canGoBack: index > 0,
      canGoForward: index < history.length - 1,
      navigate,
      replace,
      goBack,
      goForward,
      restart,
      featuresGridState,
      setFeaturesGridState,
    }),
    [current, index, history.length, navigate, replace, goBack, goForward, restart, featuresGridState],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
