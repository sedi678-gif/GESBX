'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth } from '@/firebase';

const STEPS = [
  { title: 'Profilini tamamla', description: 'Adını, şəklini və oyun məlumatlarını əlavə et.', href: '/profile', action: 'Profilə keç' },
  { title: 'İcmanı kəşf et', description: 'Oyunçuları tap, paylaşımlara bax və ittifaq qur.', href: '/explore', action: 'Kəşf et' },
  { title: 'Hesabını qoru', description: 'E-poçtunu təsdiqlə və giriş məlumatlarını təhlükəsiz saxla.', href: '/profile', action: 'Davam et' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) {
      router.replace('/login');
      return;
    }
    setEmailVerified(auth.currentUser.emailVerified);
    setReady(true);
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
            <span> — gələnlər qutusundakı təsdiq linkini aç. </span>
            <button type="button" onClick={async () => {
              await auth.currentUser?.reload();
              setEmailVerified(Boolean(auth.currentUser?.emailVerified));
            }} style={styles.refresh}>Yoxla
            </button>
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
        <button type="button" onClick={() => {
          localStorage.setItem('gesbx:onboarding-completed', 'true');
          router.push('/');
        }} style={styles.button}>Tətbiqə başla</button>
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
