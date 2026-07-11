import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

const Sidebar: React.FC = () => {
  const { toggleTheme, allDecks, meta } = useAppContext();

  const handleOpenPalette = () => {
    // TODO: Command Palette implementation
    console.log('Open Command Palette');
  };

  const getRelativeTime = (iso?: string) => {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days < 0) return 'just now';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  const gen = meta?.generated;
  const isStale = gen ? Math.floor((Date.now() - new Date(gen).getTime()) / 86400000) > 14 : false;

  return (
    <aside className="fixed left-0 top-0 w-[260px] h-screen border-r border-surface-border bg-surface/50 backdrop-blur-xl flex flex-col pt-8 pb-6 px-4 z-50">
      <div className="flex items-center gap-3 px-3 mb-8 text-lg font-semibold tracking-tight text-content-heading">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="w-7 h-7 text-brand-accent fill-brand-accent/20">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Diana Deck Lab</span>
      </div>

      <nav className="flex flex-col gap-1 flex-1">
        {[
          { to: '/build', label: 'Build', icon: <><path d="M12 2.5 20.2 7.25 V16.75 L12 21.5 3.8 16.75 V7.25 Z" /><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none" /></> },
          { to: '/analyze', label: 'Analyze', icon: <><path d="M3.5 20.5 H20.5" /><path d="M4.5 15.5 9.5 9.5 13 12.5 19.5 4.5" /></> },
          { to: '/meta', label: 'Meta', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12 H20.5" /><path d="M12 3.5 c4.4 4.7 4.4 12.3 0 17 c-4.4 -4.7 -4.4 -12.3 0 -17 Z" /></> },
          { to: '/log', label: 'Log', icon: <><path d="M12 5.5 C10 3.8 6.8 3.6 4 4.6 V19 c2.8 -1 6 -0.8 8 0.9 c2 -1.7 5.2 -1.9 8 -0.9 V4.6 C17.2 3.6 14 3.8 12 5.5 Z" /><path d="M12 5.5 V19.9" /></> },
          { to: '/compare', label: 'Compare', icon: <><path d="M6.5 7 H20.5 M17 3.5 20.5 7 17 10.5" /><path d="M17.5 17 H3.5 M7 13.5 3.5 17 7 20.5" /></> },
          { to: '/decks', label: 'Decks', icon: <><rect x="4" y="7" width="10.5" height="14" rx="1.5" /><path d="M8.5 4.5 h9 a1.5 1.5 0 0 1 1.5 1.5 v12" /></> },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-brand-accent-bg text-brand-accent shadow-[inset_0_0_0_1px_var(--color-brand-accent-border)]'
                  : 'text-content hover:bg-surface-hover hover:text-content-heading'
              }`
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 opacity-80">
              {item.icon}
            </svg>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-4 mt-auto pt-6 border-t border-surface-border text-sm text-content-muted">
        <div>
          <div className="font-mono text-xs mb-1">{allDecks.length} decks loaded</div>
          {gen && (
            <div
              className="flex items-center gap-2 font-mono text-xs"
              title={`Deck data last changed ${new Date(gen).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}${meta?.latestEvent ? ', newest event ' + meta.latestEvent : ''}.`}
            >
              <span className={`w-2 h-2 rounded-full ${isStale ? 'bg-status-danger' : 'bg-status-lock'}`}></span>
              Updated {getRelativeTime(gen)}
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-2">
          <button 
            className="flex items-center justify-between w-full px-3 py-2 text-left rounded-lg hover:bg-surface-hover text-content transition-colors group"
            onClick={handleOpenPalette}
          >
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4 text-content-muted group-hover:text-content-heading">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M15.8 15.8 21 21" />
              </svg>
              Search
            </span>
            <span className="px-1.5 py-0.5 text-[10px] font-mono border border-surface-border rounded bg-surface-muted text-content-muted">⌘K</span>
          </button>
          
          <button 
            className="flex items-center gap-2 w-full px-3 py-2 text-left rounded-lg hover:bg-surface-hover text-content transition-colors group"
            onClick={toggleTheme}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-content-muted group-hover:text-content-heading">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 3.5 a8.5 8.5 0 0 0 0 17 Z" fill="currentColor" stroke="none" />
            </svg>
            Theme
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
