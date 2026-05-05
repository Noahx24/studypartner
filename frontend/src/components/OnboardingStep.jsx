export function OnboardingStep({ title, subtitle, children }) {
    return (<section className="card space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </header>
      {children}
    </section>);
}
