import { useEffect, type ComponentType } from 'react';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ChooseRepoScreen } from './screens/ChooseRepoScreen';
import { DebugSkeletonScreen } from './screens/DebugSkeletonScreen';
import { MapPagesScreen } from './screens/MapPagesScreen';
import { CreatePageScreen } from './screens/CreatePageScreen';
import { SectionListScreen } from './screens/SectionListScreen';
import { SiteChromeScreen } from './screens/SiteChromeScreen';
import { ChromeDetailScreen } from './screens/ChromeDetailScreen';
import { GeneratingSkeletonScreen } from './screens/GeneratingSkeletonScreen';
import { SkeletonReviewScreen } from './screens/SkeletonReviewScreen';
import { SkeletonEditScreen } from './screens/SkeletonEditScreen';
import { ApplyingStylesScreen } from './screens/ApplyingStylesScreen';
import { SectionCompleteScreen } from './screens/SectionCompleteScreen';
import { PasteScreen } from './screens/PasteScreen';
import { PageCompleteScreen } from './screens/PageCompleteScreen';
import { SiteProgressScreen } from './screens/SiteProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { NotMappedScreen } from './screens/NotMappedScreen';
import { ErrorScreen } from './screens/ErrorScreen';
import { ComponentOpportunitiesScreen } from './screens/ComponentOpportunitiesScreen';
import { Callout } from './components/Callout';
import type { ScreenName } from './types';

const SCREEN_COMPONENTS: Record<ScreenName, ComponentType> = {
  'welcome': WelcomeScreen,
  'choose-repo': ChooseRepoScreen,
  'debug-skeleton': DebugSkeletonScreen,
  'map-pages': MapPagesScreen,
  'create-page': CreatePageScreen,
  'section-list': SectionListScreen,
  'site-chrome': SiteChromeScreen,
  'chrome-detail': ChromeDetailScreen,
  'generating-skeleton': GeneratingSkeletonScreen,
  'skeleton-review': SkeletonReviewScreen,
  'skeleton-edit': SkeletonEditScreen,
  'applying-styles': ApplyingStylesScreen,
  'paste-section': PasteScreen,
  'section-complete': SectionCompleteScreen,
  'page-complete': PageCompleteScreen,
  'site-progress': SiteProgressScreen,
  'settings': SettingsScreen,
  'not-mapped': NotMappedScreen,
  'error': ErrorScreen,
  'component-opportunities': ComponentOpportunitiesScreen,
};

/**
 * Dev wrapper: NavigationProvider + sidebar/topbar shell + current screen.
 *
 * For production (real Webflow extension), inline this instead:
 *
 *   export function App() {
 *     return (
 *       <NavigationProvider initialScreen="section-list">
 *         <CurrentScreen />
 *       </NavigationProvider>
 *     );
 *   }
 */
export default function App() {
  return (
    <NavigationProvider>
      <AppStateProvider>
        <AppStateBoundScreens />
      </AppStateProvider>
    </NavigationProvider>
  );
}

function AppStateBoundScreens() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <InitialRouteResolver />
      <GlobalHintBar />
      <div className="flex-1 min-h-0">
        <ScreenRenderer />
      </div>
    </div>
  );
}

/** Instructional message bar at the top of the panel — the visible home for
 *  "what to do next" guidance (footer text was easy to miss). */
function GlobalHintBar() {
  const { uiHint, setUiHint } = useAppState();
  if (!uiHint) {
    return null;
  }
  return (
    <div
      className="px-4 py-2.5 flex items-center gap-2.5 flex-shrink-0 border-b text-[12.5px]"
      style={{
        background: "rgba(20,110,245,0.10)",
        borderColor: "rgba(20,110,245,0.28)",
        color: "#bcd7ff"
      }}
    >
      <span aria-hidden className="text-[14px] leading-none">👉</span>
      <span className="flex-1 min-w-0">{uiHint}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setUiHint(null)}
        className="w-5 h-5 rounded inline-flex items-center justify-center hover:bg-white/[0.08] flex-shrink-0"
      >
        ×
      </button>
    </div>
  );
}

function InitialRouteResolver() {
  const { current, historyLength, replace } = useNavigation();
  const {
    activeMapping,
    designerContext,
    isBootstrapping,
    isLoadingWorkflowState,
    livePages,
    mappingRows,
    selectedRepoId
  } = useAppState();

  useEffect(() => {
    if (
      current === 'debug-skeleton' ||
      isBootstrapping ||
      isLoadingWorkflowState ||
      historyLength !== 1 ||
      current !== 'welcome' ||
      !selectedRepoId
    ) {
      return;
    }

    if (mappingRows.length === 0 && livePages.length > 0) {
      replace('map-pages');
      return;
    }

    if (designerContext?.pageId) {
      replace(activeMapping?.repoPageId ? 'section-list' : 'not-mapped');
      return;
    }

    replace('map-pages');
  }, [
    activeMapping?.repoPageId,
    current,
    designerContext?.pageId,
    historyLength,
    isBootstrapping,
    isLoadingWorkflowState,
    livePages.length,
    mappingRows.length,
    replace,
    selectedRepoId
  ]);

  return null;
}

function ScreenRenderer() {
  const { current } = useNavigation();
  const { versionSkewWarning } = useAppState();
  const Screen = SCREEN_COMPONENTS[current];
  return (
    <>
      {versionSkewWarning ? (
        <div className="px-4 pt-4">
          <Callout tone="warning" title="Version mismatch">
            {versionSkewWarning}
          </Callout>
        </div>
      ) : null}
      <Screen />
    </>
  );
}
