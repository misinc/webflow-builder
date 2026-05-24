import { useEffect, type ComponentType } from 'react';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { AppStateProvider, useAppState } from './context/AppStateContext';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { ChooseRepoScreen } from './screens/ChooseRepoScreen';
import { MapPagesScreen } from './screens/MapPagesScreen';
import { CreatePageScreen } from './screens/CreatePageScreen';
import { SectionListScreen } from './screens/SectionListScreen';
import { GeneratingSkeletonScreen } from './screens/GeneratingSkeletonScreen';
import { SkeletonReviewScreen } from './screens/SkeletonReviewScreen';
import { SkeletonEditScreen } from './screens/SkeletonEditScreen';
import { ApplyingStylesScreen } from './screens/ApplyingStylesScreen';
import { SectionCompleteScreen } from './screens/SectionCompleteScreen';
import { PageCompleteScreen } from './screens/PageCompleteScreen';
import { SiteProgressScreen } from './screens/SiteProgressScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { NotMappedScreen } from './screens/NotMappedScreen';
import { ErrorScreen } from './screens/ErrorScreen';
import { ComponentOpportunitiesScreen } from './screens/ComponentOpportunitiesScreen';
import type { ScreenName } from './types';

const SCREEN_COMPONENTS: Record<ScreenName, ComponentType> = {
  'welcome': WelcomeScreen,
  'choose-repo': ChooseRepoScreen,
  'map-pages': MapPagesScreen,
  'create-page': CreatePageScreen,
  'section-list': SectionListScreen,
  'generating-skeleton': GeneratingSkeletonScreen,
  'skeleton-review': SkeletonReviewScreen,
  'skeleton-edit': SkeletonEditScreen,
  'applying-styles': ApplyingStylesScreen,
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
    <AppStateProvider>
      <NavigationProvider>
        <CurrentScreen />
      </NavigationProvider>
    </AppStateProvider>
  );
}

function CurrentScreen() {
  return (
    <>
      <InitialRouteResolver />
      <ScreenRenderer />
    </>
  );
}

function InitialRouteResolver() {
  const { current, historyLength, replace } = useNavigation();
  const {
    activeMapping,
    designerContext,
    isBootstrapping,
    livePages,
    mappingRows,
    selectedRepoId
  } = useAppState();

  useEffect(() => {
    if (isBootstrapping || historyLength !== 1 || current !== 'welcome' || !selectedRepoId) {
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
    livePages.length,
    mappingRows.length,
    replace,
    selectedRepoId
  ]);

  return null;
}

function ScreenRenderer() {
  const { current } = useNavigation();
  const Screen = SCREEN_COMPONENTS[current];
  return <Screen />;
}
