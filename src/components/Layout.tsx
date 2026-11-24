import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  ScanLine,
  Settings,
  Users,
} from 'lucide-react';
import type { TabId } from '../types';
import { OwlLogo } from './OwlLogo';

interface LayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  pendingSwapsCount: number;
  children: React.ReactNode;
}

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'calendar', label: 'Mi Turno', icon: CalendarDays },
  { id: 'team', label: 'Todos', icon: Users },
  { id: 'roster', label: 'Cuadrante', icon: ScanLine },
  { id: 'swaps', label: 'Cambios', icon: ArrowLeftRight },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
];

const TAB_TITLES: Record<TabId, string> = {
  calendar: 'Batallón EW III/32 · Mi Turno',
  team: 'Batallón EW III/32 · Equipo',
  roster: 'Batallón EW III/32 · Cuadrante',
  swaps: 'Batallón EW III/32 · Cambios',
  stats: 'Batallón EW III/32 · Estadísticas',
  settings: 'Batallón EW III/32 · Ajustes',
};

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  pendingSwapsCount,
  children,
}) => {
  return (
    <div className="min-h-dvh flex flex-col text-slate-100">
      {/* Cabecera fija respetando Dynamic Island */}
      <header className="sticky top-0 z-30 glass-bar border-b border-white/10 pt-safe">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-0.5 rounded-2xl bg-gradient-to-br from-amber-400/70 to-sky-400/50 shadow-lg shadow-amber-500/15">
              <OwlLogo className="w-9 h-9 rounded-[14px]" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-widest text-sm text-white">BEW</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/35">
                  ZETO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{TAB_TITLES[activeTab]}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onTabChange('settings')}
            className={`p-2.5 rounded-2xl border transition-all active:scale-95 ${
              activeTab === 'settings'
                ? 'bg-amber-500 text-[#070B12] border-amber-300 shadow-lg shadow-amber-500/25'
                : 'bg-slate-900/70 border-white/10 text-slate-300 hover:text-white'
            }`}
            aria-label="Ajustes"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 pt-3.5 pb-nav-safe">
        {children}
      </main>

      {/* Barra de navegación inferior flotante estilo iOS */}
      <nav
        className="fixed bottom-0 inset-x-0 z-30 px-3 pb-safe pointer-events-none"
        aria-label="Navegación principal"
      >
        <div className="max-w-md mx-auto pointer-events-auto glass-bar border border-white/12 rounded-3xl shadow-2xl shadow-black/70 grid grid-cols-5 p-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all active:scale-95 ${
                  active
                    ? 'bg-amber-500/18 text-amber-300 border border-amber-400/35 shadow-inner'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.id === 'swaps' && pendingSwapsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[#070B12] text-[10px] font-bold flex items-center justify-center shadow">
                      {pendingSwapsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-semibold mt-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
