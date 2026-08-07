import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredRenderProps {
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
  rootMargin?: string;
}

export function getDeferredPlaceholderStyle(height = 280) {
  const minHeight = Math.min(220, height);
  return { height: `clamp(${minHeight}px, 58vw, ${height}px)` };
}

export function canUseVisibilityObserver() {
  return typeof window !== "undefined" && "IntersectionObserver" in window;
}

export function DeferredRender({ children, fallback, className = "min-w-0", rootMargin = "180px" }: DeferredRenderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(() => !canUseVisibilityObserver());

  useEffect(() => {
    if (shouldRender) return undefined;

    const element = containerRef.current;
    if (!element) {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldRender(true);
        observer.disconnect();
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, shouldRender]);

  return (
    <div ref={containerRef} className={className}>
      {shouldRender ? children : fallback}
    </div>
  );
}
