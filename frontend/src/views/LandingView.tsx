export const LandingView = ({ onEnter }: { onEnter: () => void }) => (
  <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-6 px-6 text-center">
    <span className="rounded-full border border-zinc-700 px-4 py-1 text-xs text-zinc-300">AI-powered planning</span>
    <h1 className="text-4xl font-semibold leading-tight md:text-6xl">Study better every day with calm, focused plans.</h1>
    <p className="max-w-2xl text-zinc-400">Build modules, upload notes, and follow your daily sessions with adaptive rescheduling and progress tracking.</p>
    <button className="btn-primary" onClick={onEnter}>
      Open Dashboard
    </button>
  </main>
);
