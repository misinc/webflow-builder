export type ScreenName =
  | 'welcome'
  | 'choose-repo'
  | 'debug-skeleton'
  | 'map-pages'
  | 'create-page'
  | 'section-list'
  | 'generating-skeleton'
  | 'skeleton-review'
  | 'skeleton-edit'
  | 'applying-styles'
  | 'paste-section'
  | 'section-complete'
  | 'page-complete'
  | 'site-progress'
  | 'settings'
  | 'not-mapped'
  | 'error'
  | 'component-opportunities';

export type Phase =
  | 'Onboarding'
  | 'Main'
  | 'Build flow'
  | 'Settings'
  | 'Edge case'
  | 'Proposed';

export interface ScreenMeta {
  num: string;
  phase: Phase;
  title: string;
}

export const SCREENS: Record<ScreenName, ScreenMeta> = {
  'welcome':              { num: '01', phase: 'Onboarding', title: 'Welcome — how it works' },
  'choose-repo':          { num: '02', phase: 'Onboarding', title: 'Choose repository' },
  'debug-skeleton':       { num: '03', phase: 'Proposed',   title: 'Debug skeleton playground' },
  'map-pages':            { num: '04', phase: 'Onboarding', title: 'Map Webflow pages to repo pages' },
  'create-page':          { num: '05', phase: 'Onboarding', title: 'Create a new Webflow page' },
  'section-list':         { num: '06', phase: 'Main',       title: 'Section list — home base' },
  'generating-skeleton':  { num: '07', phase: 'Build flow', title: 'Generating skeleton' },
  'skeleton-review':      { num: '08', phase: 'Build flow', title: 'Skeleton tree review' },
  'paste-section':        { num: '08b', phase: 'Build flow', title: 'Paste into Webflow' },
  'skeleton-edit':        { num: '09', phase: 'Build flow', title: 'Edit skeleton tree' },
  'applying-styles':      { num: '10', phase: 'Build flow', title: 'Applying styles' },
  'section-complete':     { num: '11', phase: 'Build flow', title: 'Section complete' },
  'page-complete':        { num: '12', phase: 'Build flow', title: 'Page complete' },
  'site-progress':        { num: '13', phase: 'Settings',   title: 'Site progress' },
  'settings':             { num: '14', phase: 'Settings',   title: 'Settings' },
  'not-mapped':           { num: '15', phase: 'Edge case',  title: 'Page not mapped' },
  'error':                { num: '16', phase: 'Edge case',  title: 'Error — skeleton failed' },
  'component-opportunities': { num: '17', phase: 'Proposed', title: 'Component opportunities' },
};

export type SectionStatus = 'pending' | 'in-progress' | 'complete' | 'skipped' | 'error';

export type FeaturesGridState = 'in-progress' | 'complete';
