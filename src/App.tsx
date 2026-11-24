import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { OwlLogo } from './components/OwlLogo';
import { SwapModal } from './components/SwapModal';
import { useApp } from './context/AppContext';
import type { ShiftCode, TabId } from './types';
import { getCurrentMonthKey } from './utils/dateUtils';
import { CalendarView } from './views/CalendarView';
import { OriginalRosterView } from './views/OriginalRosterView';
import { SettingsView } from './views/SettingsView';
import { StatsView } from './views/StatsView';
import { SwapsView } from './views/SwapsView';

export const App: React.FC = () => {
  const { loading, swaps } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('calendar');
  const [monthKey, setMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [swapModalState, setSwapModalState] = useState<{
    open: boolean;
    date?: string;
    shift?: ShiftCode;
  }>({ open: false });

  const pendingSwapsCount = swaps.filter((s) => s.type === 'debt' && !s.settled).length;

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#0B0F17] flex flex-col items-center justify-center gap-3">
        <OwlLogo className="w-16 h-16 animate-pulse" />
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">
          Cargando BEW...
        </p>
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      pendingSwapsCount={pendingSwapsCount}
    >
      {activeTab === 'calendar' && (
        <CalendarView
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          onOpenSwap={(date, shift) => setSwapModalState({ open: true, date, shift })}
        />
      )}

      {activeTab === 'roster' && (
        <OriginalRosterView
          monthKey={monthKey}
          onMonthChange={setMonthKey}
          onGoToSettings={() => setActiveTab('settings')}
        />
      )}

      {activeTab === 'swaps' && (
        <SwapsView onNewSwap={() => setSwapModalState({ open: true })} />
      )}

      {activeTab === 'stats' && <StatsView />}

      {activeTab === 'settings' && <SettingsView />}

      {swapModalState.open && (
        <SwapModal
          initialDate={swapModalState.date}
          initialShift={swapModalState.shift}
          onClose={() => setSwapModalState({ open: false })}
        />
      )}
    </Layout>
  );
};

export default App;
