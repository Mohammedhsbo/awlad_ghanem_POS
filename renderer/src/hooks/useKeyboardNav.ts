import { useEffect } from 'react';

interface KeyboardNavOptions {
  onTab?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onF1?: () => void;
  onF2?: () => void;
  onF3?: () => void;
  onF4?: () => void;
}

export function useKeyboardNav(options: KeyboardNavOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Tab':
          if (options.onTab) {
            e.preventDefault();
            options.onTab();
          }
          break;
        case 'Enter':
          if (options.onEnter) {
            e.preventDefault();
            options.onEnter();
          }
          break;
        case 'Escape':
          if (options.onEscape) {
            e.preventDefault();
            options.onEscape();
          }
          break;
        case 'F1':
          if (options.onF1) {
            e.preventDefault();
            options.onF1();
          }
          break;
        case 'F2':
          if (options.onF2) {
            e.preventDefault();
            options.onF2();
          }
          break;
        case 'F3':
          if (options.onF3) {
            e.preventDefault();
            options.onF3();
          }
          break;
        case 'F4':
          if (options.onF4) {
            e.preventDefault();
            options.onF4();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [options]);
}
