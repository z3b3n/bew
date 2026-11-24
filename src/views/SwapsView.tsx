import React, { useMemo } from 'react';
import { ArrowLeftRight, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatShortDateEs } from '../utils/dateUtils';

interface SwapsViewProps {
  onNewSwap: () => void;
}

export const SwapsView: React.FC<SwapsViewProps> = ({ onNewSwap }) => {
  const { users, primaryUser, swaps, settleSwap, deleteSwap } = useApp();
  const teammates = users.filter((u) => u.id !== primaryUser.id);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const balances = useMemo(() => {
    return teammates.map((tm) => {
      const pending = swaps.filter(
        (s) => s.teammateId === tm.id && s.type === 'debt' && !s.settled
      );
      let net = 0;
      for (const s of pending) {
        net += s.direction === 'owed_to_me' ? 1 : -1;
      }
      return {
        user: tm,
        net,
        pendingCount: pending.length,
      };
    });
  }, [teammates, swaps]);

  const pendingDebts = swaps.filter((s) => s.type === 'debt' && !s.settled);
  const historySwaps = swaps.filter((s) => s.type === 'exchange' || s.settled);

  const totalOwedToMe = balances.reduce((acc, b) => acc + (b.net > 0 ? b.net : 0), 0);
  const totalIOwe = balances.reduce((acc, b) => acc + (b.net < 0 ? Math.abs(b.net) : 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="tactical-card rounded-2xl p-3 border-emerald-500/30">
          <div className="text-[11px] text-emerald-300 font-semibold">Servicios a favor</div>
          <div className="text-2xl font-black text-white mt-0.5 tabular-nums">+{totalOwedToMe}</div>
        </div>
        <div className="tactical-card rounded-2xl p-3 border-rose-500/30">
          <div className="text-[11px] text-rose-300 font-semibold">Servicios que debes</div>
          <div className="text-2xl font-black text-white mt-0.5 tabular-nums">-{totalIOwe}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewSwap}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-[#070B12] text-xs font-extrabold shadow-lg shadow-amber-500/20 active:scale-[0.99]"
      >
        <Plus className="w-4 h-4 stroke-[2.5]" />
        <span>Registrar cambio o servicio</span>
      </button>

      {/* Balance neto por compañero */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Balance neto por compañero
        </h3>

        {balances.length === 0 ? (
          <div className="tactical-card rounded-2xl p-4 text-xs text-slate-400">
            Añade compañeros en Ajustes para llevar el balance de servicios.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {balances.map(({ user, net }) => (
              <div key={user.id} className="tactical-card rounded-2xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: user.color }}
                  />
                  <span className="text-xs font-semibold text-white truncate">{user.name}</span>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    net > 0
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : net < 0
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {net > 0 ? `+${net} favor` : net < 0 ? `${net} debes` : 'Al día'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Servicios pendientes */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Servicios pendientes ({pendingDebts.length})
        </h3>

        {pendingDebts.length === 0 ? (
          <div className="tactical-card rounded-2xl p-4 text-center text-xs text-slate-400">
            No tienes servicios pendientes de saldar.
          </div>
        ) : (
          <div className="space-y-2">
            {pendingDebts.map((sw) => {
              const tm = userMap.get(sw.teammateId);
              const owedToMe = sw.direction === 'owed_to_me';
              return (
                <div
                  key={sw.id}
                  className="tactical-card rounded-2xl p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          owedToMe
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {owedToMe ? 'Me deben' : 'Debo'}
                      </span>
                      <span className="text-xs font-bold text-white truncate">
                        {tm?.name ?? 'Compañero'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {sw.debtDate ? formatShortDateEs(sw.debtDate) : ''} · Turno {sw.debtShift}
                    </p>
                    {sw.note && <p className="text-[11px] text-slate-500 mt-0.5">{sw.note}</p>}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void settleSwap(sw.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Saldar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSwap(sw.id)}
                      className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historial */}
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
          Historial de cambios ({historySwaps.length})
        </h3>

        {historySwaps.length === 0 ? (
          <div className="tactical-card rounded-2xl p-4 text-center text-xs text-slate-500">
            Aún no hay intercambios ni servicios saldados.
          </div>
        ) : (
          <div className="space-y-2">
            {historySwaps.map((sw) => {
              const tm = userMap.get(sw.teammateId);
              return (
                <div
                  key={sw.id}
                  className="tactical-card rounded-2xl p-3 flex items-center justify-between gap-2 opacity-85"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">
                        {tm?.name ?? 'Compañero'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {sw.type === 'exchange' ? '1x1' : 'Saldado'}
                      </span>
                    </div>
                    {sw.type === 'exchange' ? (
                      <p className="text-[11px] text-slate-300 mt-1">
                        Cede {sw.dateGiven ? formatShortDateEs(sw.dateGiven) : ''} ({sw.shiftGiven}) ↔
                        Cubre {sw.dateCovered ? formatShortDateEs(sw.dateCovered) : ''} ({sw.shiftCovered})
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-300 mt-1">
                        {sw.direction === 'owed_to_me' ? 'A favor' : 'Debía'} ·{' '}
                        {sw.debtDate ? formatShortDateEs(sw.debtDate) : ''} ({sw.debtShift})
                      </p>
                    )}
                    {sw.note && <p className="text-[11px] text-slate-500 mt-0.5">{sw.note}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={() => void deleteSwap(sw.id)}
                    className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 shrink-0"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
