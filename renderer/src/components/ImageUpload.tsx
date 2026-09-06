import { useEffect, useState, type ChangeEvent } from 'react';
import { Image, LoaderCircle, Upload, X } from 'lucide-react';
import { upload } from '../api';

export default function ImageUpload({ value, onUploaded, onClear, lang }: {
  value?: string;
  onUploaded: (url: string) => void;
  onClear: () => void;
  lang: 'en' | 'ar';
}) {
  const isRtl = lang === 'ar';
  const [preview, setPreview] = useState(value ?? '');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPreview(value ?? ''), [value]);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    setIsUploading(true);
    try {
      const result = await upload.uploadFile(file);
      onUploaded(result.url);
      setPreview(result.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (isRtl ? 'فشل رفع الصورة' : 'Image upload failed'));
      setPreview(value ?? '');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="field-label">
      <span>{isRtl ? 'صورة الماكينة' : 'Machine image'}</span>
      {preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img src={preview} alt={isRtl ? 'معاينة الماكينة' : 'Machine preview'} style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 8 }} />
          <button type="button" className="secondary-action" onClick={onClear} title={isRtl ? 'إزالة الصورة' : 'Remove image'}><X size={16} /></button>
        </div>
      )}
      <label className="secondary-action" style={{ width: 'fit-content', cursor: isUploading ? 'wait' : 'pointer' }}>
        {isUploading ? <LoaderCircle size={16} className="spin" /> : preview ? <Image size={16} /> : <Upload size={16} />}
        {isUploading ? (isRtl ? 'جارٍ الرفع...' : 'Uploading...') : (isRtl ? 'اختيار صورة' : 'Choose image')}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleChange} disabled={isUploading} style={{ display: 'none' }} />
      </label>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}