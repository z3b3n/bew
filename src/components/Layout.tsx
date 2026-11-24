import React from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  ScanLine,
  Settings,
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
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'roster', label: 'Cuadrante', icon: ScanLine },
  { id: 'swaps', label: 'Cambios', icon: ArrowLeftRight },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
  { id: 'settings', label: 'Ajustes', icon: Settings },
];

const TAB_TITLES: Record<TabId, string> = {
  calendar: 'Turnos del Equipo',
  roster: 'Cuadrante Original',
  swaps: 'Cambios y Deudas',
  stats: 'Estadísticas',
  settings: 'Configuración',
};

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  pendingSwapsCount,
  children,
}) => {
  return (
    <div className="min-h-dvh flex flex-col bg-[#0B0F17] text-slate-100">
      {/* Cabecera fija respetando Dynamic Island */}
      <header className="sticky top-0 z-30 glass-bar border-b border-slate-800/80 pt-safe">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <OwlLogo className="w-8 h-8 rounded-xl shadow-md shadow-amber-500/10" />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-wider text-sm text-white">BEW</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  ZETO
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{TAB_TITLES[activeTab]}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400/90 animate-pulse" />
            <span>Offline OK</span>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 pt-3 pb-nav-safe">
        {children}
      </main>

      {/* Barra de navegación inferior iOS */}
      <nav
        className="fixed bottom-0 inset-x-0 z-30 glass-bar border-t border-slate-800/80 pb-safe"
        aria-label="Navegación principal"
      >
        <div className="max-w-3xl mx-auto grid grid-cols-5 px-1 pt-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl transition-colors ${
                  active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {tab.id === 'swaps' && pendingSwapsCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-[#0B0F17] text-[10px] font-bold flex items-center justify-center">
                      {pendingSwapsCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium mt-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
