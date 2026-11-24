import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { USER_COLOR_PALETTE } from '../constants/shifts';
import { useApp } from '../context/AppContext';
import { exportBackupJson, importBackupJson } from '../db/indexedDb';
import type { VisionProvider } from '../types';

export const SettingsView: React.FC = () => {
  const { users, settings, addUser, updateUser, deleteUser, updateSettings, refreshAll } =
    useApp();

  // Nuevo compañero
  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newColor, setNewColor] = useState(USER_COLOR_PALETTE[0]);

  // API Key
  const [showKey, setShowKey] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Backup
  const [includeImages, setIncludeImages] = useState(true);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    await addUser({
      name: trimmed,
      alias: newAlias.trim() || undefined,
      color: newColor,
    });
    setNewName('');
    setNewAlias('');
    setNewColor(USER_COLOR_PALETTE[(users.length + 1) % USER_COLOR_PALETTE.length]);
  };

  const handleProviderChange = (provider: VisionProvider) => {
    const defaultModel =
      provider === 'gemini'
        ? 'gemini-2.5-flash'
        : provider === 'openai'
          ? 'gpt-4o-mini'
          : settings.model;
    void updateSettings({
      ...settings,
      visionProvider: provider,
      model: defaultModel,
    });
  };

  const handleExportBackup = async () => {
    const json = await exportBackupJson(includeImages);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bew-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setBackupNotice('Copia de seguridad descargada.');
    setTimeout(() => setBackupNotice(null), 3000);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const summary = await importBackupJson(text);
      await refreshAll();
      setBackupNotice(
        `Restaurado: ${summary.usersCount} usuarios, ${summary.shiftsCount} turnos, ${summary.rostersCount} imágenes.`
      );
    } catch (err) {
      setBackupNotice(err instanceof Error ? err.message : 'Error al importar JSON.');
    }
    setTimeout(() => setBackupNotice(null), 5000);
  };

  return (
    <div className="space-y-4">
      {/* Gestión de usuarios */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Equipo y Usuarios</h3>
        </div>

        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/70 border border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: u.color }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white truncate">{u.name}</span>
                    {u.isPrimary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        Principal
                      </span>
                    )}
                  </div>
                  {u.alias && (
                    <div className="text-[10px] text-slate-400 truncate">Alias OCR: {u.alias}</div>
                  )}
                </div>
              </div>

              {!u.isPrimary && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const nextName = window.prompt('Editar nombre del compañero:', u.name);
                      if (nextName && nextName.trim()) {
                        void updateUser({ ...u, name: nextName.trim() });
                      }
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-300"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar a ${u.name} y todos sus turnos?`)) {
                        void deleteUser(u.id);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 text-rose-400"
                    aria-label="Eliminar usuario"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={(e) => void handleAddUser(e)} className="pt-2 border-t border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre compañero"
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
            />
            <input
              type="text"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Alias en cuadrante (opc.)"
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {USER_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    newColor === c ? 'scale-125 ring-2 ring-white' : 'opacity-70'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-500 text-[#0B0F17] text-xs font-bold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </div>
        </form>
      </section>

      {/* API Key de Visión */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white">API Key de Visión (Escaneo IA)</h3>
          </div>
          {savedNotice && <span className="text-[11px] text-emerald-400">{savedNotice}</span>}
        </div>

        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          {(
            [
              { id: 'gemini', label: 'Gemini' },
              { id: 'openai', label: 'OpenAI' },
              { id: 'custom', label: 'Custom' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleProviderChange(p.id)}
              className={`py-1.5 rounded-lg text-xs font-semibold ${
                settings.visionProvider === p.id
                  ? 'bg-sky-500 text-[#0B0F17]'
                  : 'text-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">API Key (se guarda solo en tu iPhone)</label>
            <div className="flex gap-1.5">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => {
                  void updateSettings({ ...settings, apiKey: e.target.value });
                  setSavedNotice('Guardada');
                  setTimeout(() => setSavedNotice(null), 1500);
                }}
                placeholder={
                  settings.visionProvider === 'gemini' ? 'AIzaSy...' : 'sk-...'
                }
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300"
                aria-label="Mostrar u ocultar clave"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Modelo</label>
            <input
              type="text"
              value={settings.model}
              onChange={(e) => void updateSettings({ ...settings, model: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono"
            />
          </div>

          {settings.visionProvider === 'custom' && (
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Endpoint compatible OpenAI
              </label>
              <input
                type="url"
                value={settings.customEndpoint ?? ''}
                onChange={(e) =>
                  void updateSettings({ ...settings, customEndpoint: e.target.value })
                }
                placeholder="https://api.tu-proveedor.com/v1"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono"
              />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowGuide((g) => !g)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-sky-300 font-medium"
        >
          <span>¿Cómo conseguir una API Key gratuita de Gemini?</span>
          {showGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showGuide && (
          <ol className="text-[11px] text-slate-300 space-y-1.5 pl-4 list-decimal bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <li>
              Entra en <strong>aistudio.google.com</strong> con tu cuenta de Google.
            </li>
            <li>Pulsa en <strong>Get API key</strong> → <strong>Create API key</strong>.</li>
            <li>
              Copia la clave (empieza por <code>AIza...</code>) y pégala arriba con el proveedor{' '}
              <strong>Gemini</strong> y modelo <code>gemini-2.5-flash</code>.
            </li>
            <li>
              Tu clave nunca sale de tu dispositivo salvo para enviar la foto directamente al API
              elegido.
            </li>
          </ol>
        )}
      </section>

      {/* Cómputo de horas nocturnas */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-2.5">
        <h3 className="text-sm font-bold text-white">Cómputo de horas nocturnas</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void updateSettings({ ...settings, nightHoursMode: 'statutory' })}
            className={`p-2.5 rounded-xl border text-left text-xs ${
              settings.nightHoursMode === 'statutory'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Franja 22:00–06:00
            <span className="block text-[10px] font-normal opacity-80 mt-0.5">
              N: 3h día / 8h noche · AN: 4h / 8h
            </span>
          </button>
          <button
            type="button"
            onClick={() => void updateSettings({ ...settings, nightHoursMode: 'full_shift' })}
            className={`p-2.5 rounded-xl border text-left text-xs ${
              settings.nightHoursMode === 'full_shift'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-200 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            Turno completo
            <span className="block text-[10px] font-normal opacity-80 mt-0.5">
              N: 11h noche · AN: 12h noche
            </span>
          </button>
        </div>
      </section>

      {/* Copia de seguridad JSON */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Copia de seguridad local (JSON)</h3>
        </div>

        <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer">
          <span>Incluir imágenes de cuadrantes originales</span>
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(e) => setIncludeImages(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
        </label>

        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={(e) => void handleImportBackup(e)}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Exportar JSON</span>
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white"
          >
            <Upload className="w-4 h-4 text-sky-400" />
            <span>Importar JSON</span>
          </button>
        </div>

        {backupNotice && (
          <p className="text-xs text-emerald-300 text-center">{backupNotice}</p>
        )}
      </section>

      {/* Guía instalación iPhone 16 Pro */}
      <section className="tactical-card rounded-2xl p-3.5 space-y-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-white">Instalar BEW en iPhone 16 Pro</h3>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Abre BEW en <strong>Safari</strong>, pulsa el botón <strong>Compartir</strong> (cuadrado con
          flecha hacia arriba) y selecciona <strong>Añadir a pantalla de inicio</strong>. Se
          instalará con el icono del búho y funcionará 100% sin conexión.
        </p>
      </section>
    </div>
  );
};
