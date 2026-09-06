import type { ReactNode } from 'react';
import POSHeader from './POSHeader';
import StatusBar from './StatusBar';

interface POSLayoutProps {
  lang: 'en' | 'ar';
  title: string;
  children: ReactNode;
  onBack?: () => void;
}

export default function POSLayout({ lang, title, children, onBack }: POSLayoutProps) {
  const isRtl = lang === 'ar';

  return (
    <div
      className="pos-workspace min-h-screen flex flex-col bg-gray-50"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <POSHeader lang={lang} title={title} onBack={onBack} />
      
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-4">
          {children}
        </div>
      </main>

      <StatusBar lang={lang} />
    </div>
  );
}
