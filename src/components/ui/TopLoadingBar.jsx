import React, { useEffect, useState } from "react";

export default function TopLoadingBar({ loading }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      setVisible(true);
      setWidth(0);
      // Quickly get to 30%, then slowly crawl to 85%
      const t1 = setTimeout(() => setWidth(30), 50);
      const t2 = setTimeout(() => setWidth(60), 400);
      const t3 = setTimeout(() => setWidth(85), 1200);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } else {
      // Jump to 100%, then hide
      setWidth(100);
      const t = setTimeout(() => { setVisible(false); setWidth(0); }, 400);
      return () => clearTimeout(t);
    }
  }, [loading]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 shadow-sm"
        style={{
          width: `${width}%`,
          transition: width === 100
            ? "width 200ms ease-out"
            : width === 0
            ? "none"
            : "width 600ms ease-out",
        }}
      />
    </div>
  );
}