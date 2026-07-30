import { useEffect } from 'react';
export function Modal() {
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    if (mq.matches) document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = ''; };
  }, []);
  return <div>modal</div>;
}
