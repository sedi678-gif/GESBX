"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // Daxil olunmuş istifadəçiyi saytın giriş səhifəsinə (/explore),
      // daxil olmamışanı isə qeydiyyat səhifəsinə (/register) yönləndiririk.
      if (user) {
        router.replace('/explore');
      } else {
        router.replace('/register/');
      }
    });
    return () => unsub();
  }, [router]);

  return null;
}
