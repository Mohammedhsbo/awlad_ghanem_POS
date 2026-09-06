import { useState } from 'react';
import { formatReceiptForPrint, formatReceiptHTML, type ReceiptData } from '../utils/receiptFormatter';

interface ReceiptViewProps {
  lang: 'en' | 'ar';
  data: ReceiptData;
  onClose: () => void;
}

export default function ReceiptView({ lang, data, onClose }: ReceiptViewProps) {
  const isRtl = lang === 'ar';
  const [status, setStatus] = useState<string | null>(null);
  const textReceipt = formatReceiptForPrint(data, lang);
  const htmlReceipt = formatReceiptHTML(data, lang);

  const handlePrintPreview = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlReceipt);
      printWindow.document.close();
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(textReceipt).then(
      () => setStatus(isRtl ? 'تم النسخ!' : 'Copied!'),
      () => setStatus(isRtl ? 'تعذر نسخ الإيصال' : 'Could not copy receipt'),
    );
  };

  const handleNativePrint = async () => {
    if (!window.desktopPrinter) {
      handlePrintPreview();
      return;
    }
    const result = await window.desktopPrinter.print({ html: htmlReceipt });
    if (!result.success) {
      setStatus(result.reason || (isRtl ? 'فشلت الطباعة' : 'Printing failed'));
      return;
    }
    setStatus(isRtl ? 'تمت الطباعة' : 'Printed');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">
          {isRtl ? 'الإيصال' : 'Receipt'}
        </h2>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
        >
          {isRtl ? 'إغلاق' : 'Close'}
        </button>
      </div>

      {/* Preview */}
      <div className="bg-white border-2 border-gray-300 rounded-lg p-6">
        <pre
          className="font-mono text-sm whitespace-pre-wrap"
          style={{ direction: isRtl ? 'rtl' : 'ltr' }}
        >
          {textReceipt}
        </pre>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleNativePrint}
          className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          {isRtl ? '🖨️ طباعة الإيصال' : '🖨️ Print receipt'}
        </button>
        <button
          onClick={handleCopyText}
          className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
        >
          {isRtl ? '📋 نسخ النص' : '📋 Copy Text'}
        </button>
      </div>

      {status && <div className="state-panel" role="status">{status}</div>}

      <div className="text-xs text-gray-500 text-center">
        {isRtl
          ? 'ملاحظة: التكامل مع الطابعة ليس جزءاً من المواصفات الحالية'
          : 'Note: Printer integration is not part of current specifications'}
      </div>
    </div>
  );
}
