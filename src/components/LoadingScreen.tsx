export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#0c0f12] z-[9999] w-screen h-screen overflow-hidden">
      <img
        src="./loading-screener.webp"
        alt="Loading..."
        className="w-full h-full object-cover select-none pointer-events-none"
      />
    </div>
  );
}
