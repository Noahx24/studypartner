import { useState } from 'react';
export const SettingsView = ({ settings, loading, onSave }) => {
    const [form, setForm] = useState(settings);
    return (<section className="max-w-xl space-y-4">
      <h2 className="text-lg font-semibold">Settings</h2>
      <div className="card space-y-3">
        <input className="input" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })} placeholder="User ID"/>
        <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name"/>
        <input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email"/>
        <input className="input" type="number" min={1} max={12} value={form.hours_per_day} onChange={(event) => setForm({ ...form, hours_per_day: Number(event.target.value) })} placeholder="Hours/day"/>
        <input className="input" type="number" min={1} max={7} value={form.days_per_week} onChange={(event) => setForm({ ...form, days_per_week: Number(event.target.value) })} placeholder="Days/week"/>
        <select className="input" value={form.pace} onChange={(event) => setForm({ ...form, pace: event.target.value })}>
          <option value="slow">Slow</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
        <button className="btn-primary" onClick={() => onSave(form)} disabled={loading}>{loading ? 'Saving…' : 'Save settings'}</button>
      </div>
    </section>);
};
