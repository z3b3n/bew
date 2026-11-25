import React, { useState } from 'react';
import { Trash2, UserPlus, X } from 'lucide-react';
import { USER_COLOR_PALETTE } from '../constants/shifts';
import type { User } from '../types';

interface UserModalProps {
  user?: User | null;
  defaultColorIndex?: number;
  onClose: () => void;
  onSave: (data: { name: string; alias?: string; color: string }) => Promise<void>;
  onDelete?: (userId: string) => Promise<void>;
}

export const UserModal: React.FC<UserModalProps> = ({
  user,
  defaultColorIndex = 0,
  onClose,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState(user?.name ?? '');
  const [alias, setAlias] = useState(user?.alias ?? '');
  const [color, setColor] = useState(
    user?.color ?? USER_COLOR_PALETTE[defaultColorIndex % USER_COLOR_PALETTE.length]
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        alias: alias.trim() || undefined,
        color,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(user.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#111827] border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-3xl p-4 pb-safe space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-bold text-white">
              {user ? `Editar a ${user.name}` : 'Nuevo compañero'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-300"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Nombre visible
            </label>
            <input
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: CARLOS"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Alias en cuadrante OCR (opcional)
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: C. MARTÍN o apellido en la tabla"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {USER_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'scale-115 ring-2 ring-white' : 'opacity-70'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            {user && !user.isPrimary && onDelete && (
              confirmDelete ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleDelete()}
                  className="px-3 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
                >
                  Confirmar borrado
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
              )
            )}

            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 disabled:opacity-45 text-[#070B12] text-xs font-extrabold"
            >
              {saving ? 'Guardando...' : user ? 'Guardar cambios' : 'Añadir compañero'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
