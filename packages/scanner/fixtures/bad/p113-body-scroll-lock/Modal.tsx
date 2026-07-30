import { useEffect } from 'react';
export function Modal() {
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = ''; };
  }, []);
  return <div>modal</div>;
}
