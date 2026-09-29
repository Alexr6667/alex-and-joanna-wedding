export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      {children}
    </main>
  );
}
