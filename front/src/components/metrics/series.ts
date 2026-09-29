import type { Resolutions } from '@/lib/metrics';

// Who closed the chat, in stacking order (bottom to top). The three hues also
// differ in lightness so they read apart without color.
export const SERIES: {
  key: keyof Omit<Resolutions, 'total'>;
  label: string;
  fill: string;
  dot: string;
}[] = [
  { key: 'aiContained', label: 'IA', fill: 'fill-primary', dot: 'bg-primary' },
  {
    key: 'assisted',
    label: 'Asistidas',
    fill: 'fill-sky-300 dark:fill-sky-200',
    dot: 'bg-sky-300 dark:bg-sky-200',
  },
  {
    key: 'human',
    label: 'Asesor',
    fill: 'fill-amber-500 dark:fill-amber-400',
    dot: 'bg-amber-500 dark:bg-amber-400',
  },
];
