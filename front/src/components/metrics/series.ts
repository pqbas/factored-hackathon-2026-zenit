import { tr } from '@/lib/i18n';
import type { Resolutions } from '@/lib/metrics';

// Who closed the chat, in stacking order (bottom to top). The three hues also
// differ in lightness so they read apart without color.
export const SERIES: {
  key: keyof Omit<Resolutions, 'total'>;
  label: string;
  fill: string;
  dot: string;
}[] = [
  { key: 'aiContained', get label() { return tr().metrics.seriesAi; }, fill: 'fill-primary', dot: 'bg-primary' },
  {
    key: 'assisted',
    get label() {
      return tr().metrics.seriesAssisted;
    },
    fill: 'fill-sky-300 dark:fill-sky-200',
    dot: 'bg-sky-300 dark:bg-sky-200',
  },
  {
    key: 'human',
    get label() {
      return tr().metrics.seriesHuman;
    },
    fill: 'fill-amber-500 dark:fill-amber-400',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
];
