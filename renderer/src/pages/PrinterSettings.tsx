import { useCallback, useEffect, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';

type Lang = 'en' | 'ar';

export default function PrinterSettings({ lang }: { lang: Lang }) {
  const isRtl = lang === 'ar';
  const [printers, setPrinters] = useState<Array<{ name: string; displayName: string; isDefault: boolean }>>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const available = typeof window !== 'undefined' && Boolean(window.desktopPrinter);

  const load = useCallback(async () => {
    if (!window.desktopPrinter) {
      setMessage(isRtl ? 'إعدادات الطابعة متاحة داخل تطبيق سطح المكتب.' : 'Printer settings are available in the desktop app.');
      return;
    }
    const result = await window.desktopPrinter.list();
    setPrinters(result);
    setSelected(current => current || result.find(printer => printer.isDefault)?.name || result[0]?.name || '');
  }, [isRtl]);

  useEffect(() => { void load(); }, [load]);

  const test = async () => {
    if (!window.desktopPrinter) return;
    const result = await window.desktopPrinter.test(selected || undefined);
    setMessage(result.success ? (isRtl ? 'تم إرسال صفحة الاختبار.' : 'Test page sent.') : result.reason || (isRtl ? 'فشل الاختبار.' : 'Test failed.'));
  };

  return <section className="desktop-page" dir={isRtl ? 'rtl' : 'ltr'}><div className="page-heading"><div><span className="eyebrow">{isRtl ? 'الأجهزة' : 'Hardware'}</span><h1>{isRtl ? 'الطابعات' : 'Printer settings'}</h1><p>{isRtl ? 'اختبر الطابعة الأصلية من خلال جسر Electron الآمن.' : 'Test native printers through the secure Electron bridge.'}</p></div><button className="secondary-action" onClick={() => void load()}><RefreshCw size={16} /> {isRtl ? 'كشف الطابعات' : 'Detect printers'}</button></div>{!available && <div className="state-panel"><Printer size={28} /><p>{isRtl ? 'افتح نسخة Electron لاستخدام الطباعة الأصلية.' : 'Open the Electron build to use native printing.'}</p></div>}{available && <div className="surface-panel printer-panel"><h2>{isRtl ? 'الطابعة الافتراضية' : 'Default printer'}</h2><select value={selected} onChange={event => setSelected(event.target.value)}><option value="">{isRtl ? 'اختيار تلقائي' : 'System default'}</option>{printers.map(printer => <option key={printer.name} value={printer.name}>{printer.displayName || printer.name}</option>)}</select><button className="primary-action" onClick={() => void test()}><Printer size={16} /> {isRtl ? 'طباعة اختبار' : 'Test print'}</button>{message && <p className="text-muted">{message}</p>}{printers.length === 0 && <p className="text-muted">{isRtl ? 'لم يتم العثور على طابعات.' : 'No printers detected.'}</p>}</div>}</section>;
}