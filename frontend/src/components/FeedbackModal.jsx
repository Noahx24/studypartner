import { useState } from 'react';

export function FeedbackModal({
  open,
  estimated,
  onClose,
  onSubmit,
}: {
  open: boolean;
  estimated: number;
  onClose: () => void;
  onSubmit: (actual: number) => Promise<void>;
}) {
  const [actual, setActual] = useState<number>(estimated);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/30 p-4 md:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-slate-900">Session feedback</h3>
        <p className="mt-1 text-sm text-slate-500">Estimated time: {estimated} minutes.</p>
        <label className="mt-4 block text-sm text-slate-700">How long did this actually take?</label>
        <input
          className="input mt-1"
          type="number"
          min={1}
          value={actual}
          onChange={(event) => setActual(Number(event.target.value))}
        />
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose}>Skip</button>
          <button className="btn-primary flex-1" onClick={() => onSubmit(actual)}>Submit</button>
        </div>
      </div>
    </div>
  );
}
