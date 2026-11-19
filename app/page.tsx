"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebase';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // Daxil olmuş istifadəçini birbaşa profilinə yönləndiririk.
      if (user) {
        router.replace('/profile');
      } else {
        router.replace('/register/');
      }
    });
    return () => unsub();
  }, [router]);

  return null;
}
