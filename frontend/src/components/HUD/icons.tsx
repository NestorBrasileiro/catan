// Line icons for the floating controls, drawn on a 20×20 grid with the current text color
import type { ReactNode } from 'react';

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export const LayersIcon = () => (
  <Icon><path d="M10 2.5 2.5 6.5 10 10.5l7.5-4z" /><path d="m2.5 10 7.5 4 7.5-4" /><path d="m2.5 13.5 7.5 4 7.5-4" /></Icon>
);
export const SlidersIcon = () => (
  <Icon>
    <path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h10M17 15h0" />
    <circle cx="13" cy="5" r="2" /><circle cx="7" cy="10" r="2" /><circle cx="15" cy="15" r="2" />
  </Icon>
);
export const HelpIcon = () => (
  <Icon><circle cx="10" cy="10" r="7.5" /><path d="M7.8 7.6a2.3 2.3 0 1 1 3.3 2.1c-.7.4-1.1.9-1.1 1.6v.4" /><path d="M10 14.4h0" /></Icon>
);
export const SoundIcon = ({ muted }: { muted: boolean }) => (
  <Icon>
    <path d="M3 8v4h3l4 3.5v-11L6 8z" />
    {muted ? <path d="m13.5 8 4 4m0-4-4 4" /> : <path d="M13 7.5a3.5 3.5 0 0 1 0 5M15.3 5.3a6.5 6.5 0 0 1 0 9.4" />}
  </Icon>
);
export const FullscreenIcon = ({ active }: { active: boolean }) => (
  <Icon>
    {active
      ? <path d="M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17" />
      : <path d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" />}
  </Icon>
);
export const PlusIcon = () => <Icon><path d="M10 4v12M4 10h12" /></Icon>;
export const MinusIcon = () => <Icon><path d="M4 10h12" /></Icon>;
export const TargetIcon = () => (
  <Icon><circle cx="10" cy="10" r="5.5" /><circle cx="10" cy="10" r="1.5" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></Icon>
);
export const CloseIcon = () => <Icon><path d="m5 5 10 10M15 5 5 15" /></Icon>;
export const ChevronIcon = ({ open }: { open: boolean }) => (
  <Icon size={16}><path d={open ? 'm5 12.5 5-5 5 5' : 'm5 7.5 5 5 5-5'} /></Icon>
);
export const PanelIcon = () => (
  <Icon><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M12 3.5v13" /></Icon>
);
export const ExitIcon = () => (
  <Icon><path d="M8 3.5H4.5v13H8M12.5 6.5 16 10l-3.5 3.5M16 10H8" /></Icon>
);
