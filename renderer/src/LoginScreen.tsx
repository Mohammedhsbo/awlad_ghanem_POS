import { useState, type FormEvent } from 'react';
import { auth, setToken, setUser, type DesktopUser } from './api';
import { Loader2 } from 'lucide-react';
import { useToast } from './components/Toast';
import { getApiErrorMessage } from './api';

type LangType = 'en' | 'ar';

const T = {
  en: {
    title: 'Motorcycle POS', subtitle: 'Purchase Receiving Terminal',
    email: 'Email', password: 'Password',
    login: 'Sign In', loggingIn: 'Signing in…',
    error: 'Invalid credentials. Please try again.',
  },
  ar: {
    title: 'نظام POS للدراجات', subtitle: 'نظام ادراه المحل',
    email: 'البريد الإلكتروني', password: 'كلمة المرور',
    login: 'تسجيل الدخول', loggingIn: 'جاري تسجيل الدخول…',
    error: 'بيانات غير صحيحة. حاول مرة أخرى.',
  },
};

interface Props { onLogin: (user: DesktopUser) => void; lang: LangType }

export default function LoginScreen({ onLogin, lang }: Props) {
  const t = T[lang];
  const isRtl = lang === 'ar';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { accessToken, user } = await auth.login(email, password);
      setToken(accessToken);
      setUser(user);
      onLogin(user);
    } catch (reason) {
      const message = getApiErrorMessage(reason, t.error);
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
      <div className="login-card">
        <div className="login-logo">
          <img src="./logo.png" alt="Moto System logo" style={{ width: '64px', height: '64px', objectFit: 'contain', display: 'block', margin: '0 auto 0.75rem' }} />
          <div className="login-title">{t.title}</div>
          <div className="login-sub">{t.subtitle}</div>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', background: 'rgba(220,38,38,0.12)', color: '#ef4444', borderRadius: '0.625rem', fontSize: '0.875rem', marginBottom: '1rem', border: '1px solid rgba(220,38,38,0.3)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">{t.email}</label>
            <input
              className="pos-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="input-group">
            <label className="input-label">{t.password}</label>
            <input
              className="pos-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
            disabled={loading}
          >
            {loading ? <><Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} /> {t.loggingIn}</> : t.login}
          </button>
        </form>
      </div>
    </div>
  );
}
