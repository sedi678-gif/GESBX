'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/firebase';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth';

const STEPS = [
  { title: 'Profilini tamamla', description: 'Adını, şəklini və oyun məlumatlarını əlavə et.', href: '/profile', action: 'Profilə keç' },
  { title: 'İcmanı kəşf et', description: 'Oyunçuları tap, paylaşımlara bax və ittifaq qur.', href: '/explore', action: 'Kəşf et' },
  { title: 'Hesabını qoru', description: 'E-poçtunu təsdiqlə və giriş məlumatlarını təhlükəsiz saxla.', href: '/profile', action: 'Davam et' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');

  useEffect(() => {
    // Firebase Auth bərpa olunmamışdan əvvəl currentUser müvəqqəti null ola bilər.
    // İlk auth-state cavabını gözləmədən /login-ə yönləndirmək qeydiyyatı yarımçıq qoyurdu.
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      if (!user) {
        router.replace('/login');
        return;
      }

      try {
        await user.reload();
      } catch (error) {
        console.warn('Qeydiyyat sessiyası yenilənmədi:', error);
      }

      if (!active) return;
      setEmailVerified(Boolean(auth.currentUser?.emailVerified));
      setReady(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  if (!ready) return <main style={styles.page} aria-busy="true">Yüklənir…</main>;

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>GESBX · İlk addımlar</p>
        <h1 style={styles.title}>Xoş gəlmisən!</h1>
        <p style={styles.subtitle}>Hesabını qurmaq və icmaya qoşulmaq üçün bu addımları tamamla.</p>
        <div style={styles.status} role="status">
          E-poçt təsdiqi: <strong>{emailVerified ? 'təsdiqlənib' : 'təsdiq gözləyir'}</strong>
          {!emailVerified && <>
            <span> — Gmail-dəki təsdiq linkini aç. Təsdiqləmədən tətbiqə daxil olmaq mümkün deyil. </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button type="button" disabled={sendingVerification} onClick={async () => {
                const user = auth.currentUser;
                if (!user) return;
                setSendingVerification(true);
                setVerificationMessage('');
                try {
                  await sendEmailVerification(user);
                  setVerificationMessage('Təsdiq məktubu yenidən göndərildi. Gmail-in Spam qovluğunu da yoxla.');
                } catch (error: any) {
                  setVerificationMessage(error?.code === 'auth/too-many-requests'
                    ? 'Çox tez-tez sorğu göndərilib. Bir az gözlə və yenidən yoxla.'
                    : 'Məktub göndərilmədi. İnternet bağlantısını yoxla və yenidən cəhd et.');
                } finally {
                  setSendingVerification(false);
                }
              }} style={styles.refresh}>{sendingVerification ? 'Göndərilir…' : 'Təsdiq məktubunu yenidən göndər'}</button>
              <button type="button" onClick={async () => {
                await auth.currentUser?.reload();
                const verified = Boolean(auth.currentUser?.emailVerified);
                setEmailVerified(verified);
                setVerificationMessage(verified ? 'Email təsdiqləndi. İndi davam edə bilərsən.' : 'Hələ təsdiqlənməyib. Gmail-dəki linki aç.');
              }} style={styles.refresh}>Yoxla</button>
            </div>
            {verificationMessage && <p style={{ margin: '10px 0 0', fontSize: 13 }}>{verificationMessage}</p>}
          </>}
        </div>
        <ol style={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step.title} style={styles.step}>
              <span style={styles.number}>{index + 1}</span>
              <div style={{ flex: 1 }}>
                <h2 style={styles.stepTitle}>{step.title}</h2>
                <p style={styles.description}>{step.description}</p>
              </div>
              <Link href={step.href} style={styles.link}>{step.action}</Link>
            </li>
          ))}
        </ol>
        <button type="button" disabled={!emailVerified} onClick={() => {
          localStorage.setItem('gesbx:onboarding-completed', 'true');
          router.push('/');
        }} style={{ ...styles.button, opacity: emailVerified ? 1 : 0.45, cursor: emailVerified ? 'pointer' : 'not-allowed' }}>Tətbiqə başla</button>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#07111f', color: '#e5f3ff', fontFamily: 'system-ui, sans-serif' },
  card: { width: 'min(100%, 680px)', boxSizing: 'border-box', padding: 28, border: '1px solid #1e3a5f', borderRadius: 20, background: '#0d1b2d' },
  eyebrow: { color: '#67e8f9', textTransform: 'uppercase', letterSpacing: 2, fontSize: 12, fontWeight: 700 },
  title: { margin: '8px 0', fontSize: 34 },
  subtitle: { color: '#a8bdd3', lineHeight: 1.6 },
  status: { margin: '20px 0', padding: 14, borderRadius: 12, background: '#10263a', color: '#c3d8eb' },
  steps: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 },
  step: { display: 'flex', alignItems: 'center', gap: 14, padding: 16, border: '1px solid #213c59', borderRadius: 14 },
  number: { display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', background: '#123e5a', color: '#67e8f9', fontWeight: 700 },
  stepTitle: { margin: 0, fontSize: 16 },
  description: { margin: '5px 0 0', color: '#a8bdd3', fontSize: 14, lineHeight: 1.4 },
  link: { flexShrink: 0, color: '#67e8f9', fontWeight: 700, textDecoration: 'none' },
  refresh: { padding: '5px 9px', border: '1px solid #28749a', borderRadius: 8, background: 'transparent', color: '#67e8f9', cursor: 'pointer' },
  button: { width: '100%', marginTop: 20, padding: 14, border: 0, borderRadius: 12, background: 'linear-gradient(90deg,#06b6d4,#2563eb)', color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
};
