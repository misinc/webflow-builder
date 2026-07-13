export type ScreenName =
  | 'welcome'
  | 'style-guide'
  | 'sections'
  | 'build'
  | 'done'
  | 'debug-skeleton';

export type Phase = 'Flow' | 'Dev';

export interface ScreenMeta {
  num: string;
  phase: Phase;
  title: string;
}

export const SCREENS: Record<ScreenName, ScreenMeta> = {
  'welcome':        { num: '01', phase: 'Flow', title: 'Welcome — source URL' },
  'style-guide':    { num: '02', phase: 'Flow', title: 'Style Guide' },
  'sections':       { num: '03', phase: 'Flow', title: 'Sections' },
  'build':          { num: '04', phase: 'Flow', title: 'Build / paste' },
  'done':           { num: '05', phase: 'Flow', title: 'Done' },
  'debug-skeleton': { num: 'D',  phase: 'Dev',  title: 'Debug skeleton playground' },
};

export type SectionStatus = 'pending' | 'in-progress' | 'complete' | 'skipped' | 'error';

export type FeaturesGridState = 'in-progress' | 'complete';
