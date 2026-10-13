'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../../firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getAccountStatus } from '@/app/lib/accountLifecycleService';
import { getLocalProfileUserId } from '@/app/lib/userId';
import { useAppStrings } from '@/app/lib/useAppStrings';
import LanguageSwitch from '@/app/components/LanguageSwitch';

export default function LoginPage() {
  const t = useAppStrings();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Giriş cəhdi edirik
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Emailin təsdiqlənib-təsdiqlənmədiyini yoxlayırıq
      if (!user.emailVerified) {
        // Təsdiqlənməyibsə avtomatik yaradılmış sessiyanı bağlayırıq
        await signOut(auth);
        setError(t.auth.errors.verifyEmail);
        return;
      }

      const localId = getLocalProfileUserId();
      if (localId) {
        const status = await getAccountStatus(localId);
        if (status.banned) {
          await signOut(auth);
          setError(t.auth.errors.banned);
          return;
        }
        if (status.frozen) {
          router.push('/settings');
          return;
        }
      }

      router.push('/profile');

    } catch (err: any) {
      console.error('Giriş xətası:', err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError(t.auth.errors.badCreds);
      } else if (err.code === 'auth/invalid-email') {
        setError(t.auth.errors.badEmail);
      } else {
        setError(`${t.auth.errors.generic} ${err.message || ''}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif',
      boxSizing: 'border-box',
      backgroundColor: '#030712'
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: "url('/bg.jpg')",
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        filter: 'blur(2px)',
        zIndex: 0
      }} />

      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.75)',
        zIndex: 0
      }} />

      <div style={{
        position: 'relative',
        zIndex: 10,
        width: '100%',
        maxWidth: '420px',
        padding: '36px',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(6, 182, 212, 0.3)',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        color: '#ffffff',
        boxSizing: 'border-box'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ marginBottom: 12 }}>
            <LanguageSwitch compact />
          </div>
          <h2 style={{ fontSize: '30px', fontWeight: '800', background: 'linear-gradient(to right, #22d3ee, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 8px 0' }}>
            {t.auth.loginTitle}
          </h2>
          <p style={{ fontSize: '14px', color: '#93c5fd', margin: 0 }}>{t.auth.loginSubtitle}</p>
        </div>

        {error && (
          <div style={{ padding: '12px', marginBottom: '16px', fontSize: '14px', backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', textAlign: 'center', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#67e8f9', marginBottom: '6px' }}>{t.auth.email}</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@example.com"
              style={{ width: '100%', padding: '12px 16px', backgroundColor: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '12px', color: '#ffffff', outline: 'none', boxSizing: 'border-box', fontSize: '15px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#67e8f9', marginBottom: '6px' }}>{t.auth.password}</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', padding: '12px 16px', backgroundColor: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '12px', color: '#ffffff', outline: 'none', boxSizing: 'border-box', fontSize: '15px' }}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '14px', background: 'linear-gradient(to right, #06b6d4, #2563eb)', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(6, 182, 212, 0.3)', fontSize: '15px', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? t.auth.loggingIn : t.auth.login}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', fontSize: '13px' }}>
          <Link href="/forgot-password" style={{ color: '#93c5fd', textDecoration: 'none' }}>
            {t.auth.forgot}
          </Link>
          <Link href="/register" style={{ color: '#22d3ee', fontWeight: '600', textDecoration: 'underline' }}>
            {t.auth.register}
          </Link>
        </div>
      </div>
    </div>
  );
}