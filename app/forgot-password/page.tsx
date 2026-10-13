'use client';

import { useState } from 'react';
import Link from 'next/link';
import { auth } from '../../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Şifrəni sıfırlamaq üçün təlimat email ünvanınıza göndərildi! Zəhmət olmasa poçtunuzu yoxlayın.');
    } catch (err: any) {
      console.error('Şifrə sıfırlama xətası:', err);
      if (err.code === 'auth/user-not-found') {
        setError('Bu email ünvanına uyğun istifadəçi tapılmadı!');
      } else if (err.code === 'auth/invalid-email') {
        setError('Keçərsiz email ünvanı daxil etdiniz!');
      } else {
        setError(`Xəta: ${err.message || 'Şifrəni sıfırlamaq mümkün olmadı.'}`);
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
          <h2 style={{ fontSize: '26px', fontWeight: '800', background: 'linear-gradient(to right, #22d3ee, #3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 8px 0' }}>
            Şifrənin Bərpası
          </h2>
          <p style={{ fontSize: '13px', color: '#93c5fd', margin: 0 }}>Email ünvanınızla şifrənizi sıfırlayın</p>
        </div>

        {error && (
          <div style={{ padding: '12px', marginBottom: '16px', fontSize: '14px', backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', textAlign: 'center', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ padding: '12px', marginBottom: '16px', fontSize: '14px', backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', textAlign: 'center', color: '#6ee7b7' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#67e8f9', marginBottom: '6px' }}>Email Ünvanı</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@example.com"
              style={{ width: '100%', padding: '12px 16px', backgroundColor: 'rgba(0, 0, 0, 0.5)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '12px', color: '#ffffff', outline: 'none', boxSizing: 'border-box', fontSize: '15px' }}
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '14px', background: 'linear-gradient(to right, #f59e0b, #d97706)', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(245, 158, 11, 0.3)', fontSize: '15px', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Göndərilir...' : 'Sıfırlama Linki Göndər'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '14px', color: '#93c5fd', marginTop: '24px' }}>
          Giriş səhifəsinə qayıt?{' '}
          <Link href="/login" style={{ color: '#22d3ee', fontWeight: '600', textDecoration: 'underline' }}>
            Daxil ol
          </Link>
        </p>
      </div>
    </div>
  );
}