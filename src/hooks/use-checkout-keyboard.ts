'use client';
import { useEffect, useState } from 'react';

// A visual viewport contraction alone may be browser chrome or pinch zoom.
// Only hide the mobile bar while a checkout text field has keyboard focus.
export function useCheckoutKeyboard() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    let fullHeight = window.innerHeight;
    const update = () => {
      const field = document.activeElement;
      const editing = field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement &&
        ['text', 'email', 'tel', 'number', 'search', 'url', 'password'].includes(field.type);
      if (!editing) fullHeight = window.innerHeight;
      setOpen(window.innerWidth < 1024 && viewport.scale === 1 && editing &&
        !!field.closest('form[data-commerce-root]') && Math.max(fullHeight, window.innerHeight) - viewport.height > 150);
    };
    const focus = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    viewport.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', focus);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', focus);
    };
  }, []);
  return open;
}
