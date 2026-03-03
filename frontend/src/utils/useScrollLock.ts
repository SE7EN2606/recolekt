import { useLayoutEffect } from 'react';

export function useScrollLock(isLocked: boolean) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    if (!isLocked) return;

    const scrollY = window.scrollY;

    const originalHtmlOverflow = html.style.overflow;
    const originalBodyOverflow = body.style.overflow;
    const originalBodyPosition = body.style.position;
    const originalBodyTop = body.style.top;
    const originalBodyWidth = body.style.width;

    // ✅ Prevent scrollbar shift on desktop
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // 🔥 iOS + mobile freeze
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      html.style.overflow = originalHtmlOverflow;
      body.style.overflow = originalBodyOverflow;
      body.style.position = originalBodyPosition;
      body.style.top = originalBodyTop;
      body.style.width = originalBodyWidth;
      body.style.paddingRight = '';

      // restore scroll position
      window.scrollTo(0, scrollY);
    };
  }, [isLocked]);
}