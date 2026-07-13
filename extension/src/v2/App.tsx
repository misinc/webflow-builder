import type { ComponentType } from 'react';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { MigrationProvider, useMigration } from './context/MigrationContext';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { StyleGuideScreen } from './screens/StyleGuideScreen';
import { SectionsScreen } from './screens/SectionsScreen';
import { BuildScreen } from './screens/BuildScreen';
import { DoneScreen } from './screens/DoneScreen';
import { DebugSkeletonScreen } from './screens/DebugSkeletonScreen';
import type { ScreenName } from './types';

const SCREEN_COMPONENTS: Record<ScreenName, ComponentType> = {
  'welcome': WelcomeScreen,
  'style-guide': StyleGuideScreen,
  'sections': SectionsScreen,
  'build': BuildScreen,
  'done': DoneScreen,
  'debug-skeleton': DebugSkeletonScreen,
};

export default function App() {
  return (
    <NavigationProvider initialScreen="welcome">
      <MigrationProvider>
        <div className="flex flex-col h-full min-h-0">
          <NotificationBar />
          <div className="flex-1 min-h-0">
            <ScreenRenderer />
          </div>
        </div>
      </MigrationProvider>
    </NavigationProvider>
  );
}

/** Dismissible status bar at the top of the panel. Reappears whenever a new
 *  message is posted; all screen status/progress lives here, not in footers. */
function NotificationBar() {
  const { notification, dismissNotification } = useMigration();
  if (!notification || notification.dismissed) {
    return null;
  }
  const palette = {
    info: { bg: 'rgba(20,110,245,0.10)', border: 'rgba(20,110,245,0.28)', color: '#bcd7ff' },
    success: { bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.3)', color: '#8fe3c4' },
    error: { bg: 'rgba(226,75,74,0.12)', border: 'rgba(226,75,74,0.32)', color: '#ffb0b0' }
  }[notification.tone];
  return (
    <div
      className="px-4 py-2.5 flex items-center gap-2.5 flex-shrink-0 border-b text-[12.5px]"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.color }}
    >
      <span className="flex-1 min-w-0">{notification.message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismissNotification}
        className="w-5 h-5 rounded inline-flex items-center justify-center hover:bg-white/[0.08] flex-shrink-0"
      >
        ×
      </button>
    </div>
  );
}

function ScreenRenderer() {
  const { current } = useNavigation();
  const Screen = SCREEN_COMPONENTS[current];
  return <Screen />;
}
