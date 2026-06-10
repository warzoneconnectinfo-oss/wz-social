export default function LoadingSpinner({ fullScreen = false }) {
  const spinner = (
    <div className="flex items-center justify-center gap-3">
      <div className="w-6 h-6 border-2 border-zinc-700 border-t-orange-500 rounded-full animate-spin" />
      <span className="text-zinc-400 text-sm">Loading...</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return <div className="py-10">{spinner}</div>;
}
