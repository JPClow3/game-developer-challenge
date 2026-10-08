import React from 'react';

const paths = {
  anchor: <><path d="M12 3v17M8 7h8M4 13v3a8 8 0 0 0 16 0v-3M4 13l3 3m13-3-3 3" /><circle cx="12" cy="4" r="2" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  ahead: <path d="M12 19V5m-6 6 6-6 6 6" />,
  left: <path d="M19 12H5m6-6-6 6 6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  play: <path d="m8 5 11 7-11 7Z" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5M5.2 8a7 7 0 0 1 11.6-3L20 8M4 16l3.2 3A7 7 0 0 0 18.8 16" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-3 5-5 3 3-5Z" /></>,
  trophy: <><path d="M8 3h8v5a4 4 0 0 1-8 0ZM8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 12v7m-4 2h8" /></>,
  history: <><path d="M3 5v5h5M4 9a8 8 0 1 1 0 6M12 7v5l3 2" /></>,
  alert: <><path d="m12 3 10 17H2ZM12 9v4" /><path d="M12 16h.01" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`ui-icon ${className}`} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
