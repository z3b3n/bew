import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  PRIMARY_USER_ID,
  ensureSeedData,
  getAllHolidays,
  getAllShifts,
  getAllSwaps,
  getAllUsers,
  getSettings,
  putHoliday,
  putSettings,
  putShift,
  putShiftsBatch,
  putSwap,
  putUser,
  removeHoliday,
  removeShift,
  removeSwap,
  removeUserAndData,
} from '../db/indexedDb';
import type {
  AppSettings,
  HolidayEntry,
  ShiftCode,
  ShiftEntry,
  ShiftSwap,
  User,
} from '../types';
import { getMonthKey } from '../utils/dateUtils';

interface AppContextValue {
  users: User[];
  primaryUser: User;
  shifts: ShiftEntry[];
  holidays: HolidayEntry[];
  swaps: ShiftSwap[];
  settings: AppSettings;
  loading: boolean;
  shiftMap: Map<string, ShiftEntry>; // key: `${userId}_${date}`
  holidaySet: Set<string>; // key: `YYYY-MM-DD`
  upsertShift: (userId: string, date: string, shift: ShiftCode | null, note?: string) => Promise<void>;
  batchApplyShifts: (entries: ShiftEntry[]) => Promise<void>;
  toggleHoliday: (date: string, name?: string) => Promise<void>;
  setHolidaysBatch: (dates: string[]) => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'createdAt' | 'isPrimary'>) => Promise<User>;
  updateUser: (user: User) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  addSwap: (swap: Omit<ShiftSwap, 'id' | 'createdAt'>) => Promise<void>;
  settleSwap: (swapId: string, settledNote?: string) => Promise<void>;
  deleteSwap: (swapId: string) => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  refreshAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<ShiftEntry[]>([]);
  const [holidays, setHolidays] = useState<HolidayEntry[]>([]);
  const [swaps, setSwaps] = useState<ShiftSwap[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const refreshAll = useCallback(async () => {
    await ensureSeedData();
    const [u, s, h, sw, st] = await Promise.all([
      getAllUsers(),
      getAllShifts(),
      getAllHolidays(),
      getAllSwaps(),
      getSettings(),
    ]);
    setUsers(u);
    setShifts(s);
    setHolidays(h);
    setSwaps(sw);
    setSettings(st);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const primaryUser = useMemo(() => {
    return (
      users.find((u) => u.isPrimary || u.id === PRIMARY_USER_ID) ?? {
        id: PRIMARY_USER_ID,
        name: 'ZETO',
        color: '#F59E0B',
        isPrimary: true,
        createdAt: 1,
      }
    );
  }, [users]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftEntry>();
    for (const s of shifts) {
      map.set(s.id, s);
    }
    return map;
  }, [shifts]);

  const holidaySet = useMemo(() => {
    return new Set(holidays.map((h) => h.date));
  }, [holidays]);

  const upsertShift = useCallback(
    async (userId: string, date: string, shift: ShiftCode | null, note?: string) => {
      const id = `${userId}_${date}`;
      if (shift === null) {
        await removeShift(id);
        setShifts((prev) => prev.filter((item) => item.id !== id));
        return;
      }
      const entry: ShiftEntry = {
        id,
        userId,
        date,
        monthKey: getMonthKey(date),
        shift,
        note,
        updatedAt: Date.now(),
      };
      await putShift(entry);
      setShifts((prev) => {
        const idx = prev.findIndex((item) => item.id === id);
        if (idx === -1) return [...prev, entry];
        const copy = [...prev];
        copy[idx] = entry;
        return copy;
      });
    },
    []
  );

  const batchApplyShifts = useCallback(async (entries: ShiftEntry[]) => {
    if (entries.length === 0) return;
    await putShiftsBatch(entries);
    setShifts((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      for (const entry of entries) {
        map.set(entry.id, entry);
      }
      return Array.from(map.values());
    });
  }, []);

  const toggleHoliday = useCallback(
    async (date: string, name?: string) => {
      if (holidaySet.has(date)) {
        await removeHoliday(date);
        setHolidays((prev) => prev.filter((h) => h.date !== date));
      } else {
        const entry: HolidayEntry = {
          date,
          monthKey: getMonthKey(date),
          name,
        };
        await putHoliday(entry);
        setHolidays((prev) => [...prev, entry]);
      }
    },
    [holidaySet]
  );

  const setHolidaysBatch = useCallback(
    async (dates: string[]) => {
      const toAdd: HolidayEntry[] = [];
      for (const d of dates) {
        if (!holidaySet.has(d)) {
          const entry: HolidayEntry = { date: d, monthKey: getMonthKey(d) };
          await putHoliday(entry);
          toAdd.push(entry);
        }
      }
      if (toAdd.length > 0) {
        setHolidays((prev) => [...prev, ...toAdd]);
      }
    },
    [holidaySet]
  );

  const addUser = useCallback(async (data: Omit<User, 'id' | 'createdAt' | 'isPrimary'>) => {
    const newUser: User = {
      ...data,
      id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      isPrimary: false,
      createdAt: Date.now(),
    };
    await putUser(newUser);
    setUsers((prev) =>
      [...prev, newUser].sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.name.localeCompare(b.name, 'es');
      })
    );
    return newUser;
  }, []);

  const updateUser = useCallback(async (user: User) => {
    await putUser(user);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
  }, []);

  const deleteUser = useCallback(async (userId: string) => {
    if (userId === PRIMARY_USER_ID) return;
    await removeUserAndData(userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setShifts((prev) => prev.filter((s) => s.userId !== userId));
  }, []);

  const addSwap = useCallback(async (data: Omit<ShiftSwap, 'id' | 'createdAt'>) => {
    const swap: ShiftSwap = {
      ...data,
      id: `sw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
    };
    await putSwap(swap);
    setSwaps((prev) => [swap, ...prev]);
  }, []);

  const settleSwap = useCallback(
    async (swapId: string, settledNote?: string) => {
      const target = swaps.find((s) => s.id === swapId);
      if (!target) return;
      const updated: ShiftSwap = {
        ...target,
        settled: true,
        settledAt: Date.now(),
        settledNote,
      };
      await putSwap(updated);
      setSwaps((prev) => prev.map((s) => (s.id === swapId ? updated : s)));
    },
    [swaps]
  );

  const deleteSwap = useCallback(async (swapId: string) => {
    await removeSwap(swapId);
    setSwaps((prev) => prev.filter((s) => s.id !== swapId));
  }, []);

  const updateSettings = useCallback(async (next: AppSettings) => {
    const normalized = { ...next, id: 'app' as const };
    await putSettings(normalized);
    setSettings(normalized);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      users,
      primaryUser,
      shifts,
      holidays,
      swaps,
      settings,
      loading,
      shiftMap,
      holidaySet,
      upsertShift,
      batchApplyShifts,
      toggleHoliday,
      setHolidaysBatch,
      addUser,
      updateUser,
      deleteUser,
      addSwap,
      settleSwap,
      deleteSwap,
      updateSettings,
      refreshAll,
    }),
    [
      users,
      primaryUser,
      shifts,
      holidays,
      swaps,
      settings,
      loading,
      shiftMap,
      holidaySet,
      upsertShift,
      batchApplyShifts,
      toggleHoliday,
      setHolidaysBatch,
      addUser,
      updateUser,
      deleteUser,
      addSwap,
      settleSwap,
      deleteSwap,
      updateSettings,
      refreshAll,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}
