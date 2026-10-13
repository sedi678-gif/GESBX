"use client";



import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

import { onAuthStateChanged, User } from 'firebase/auth';

import { doc, onSnapshot, runTransaction } from 'firebase/firestore';

import { auth, db } from '@/firebase';

import { ensurePlayerProfile, reconcilePlayerIdentity } from '@/app/components/alliance/allianceService';

import { ensureFirebaseAuth } from '@/app/lib/firebaseAuth';

import { PlayerProfile } from '@/app/components/alliance/types';

import { getLocalProfileUserId, getLocalProfileDisplayName } from '@/app/lib/userId';

import {

  resolvePlayerManat,

  manatWritePatch,

  clearLegacyBalanceStorage,

} from '@/app/lib/manat';



interface UserContextType {

  user: User | null;

  userId: string;

  manat: number;

  manatReady: boolean;

  playerProfile: PlayerProfile | null;

  addManat: (amount: number) => Promise<void>;

  spendManat: (amount: number) => Promise<boolean>;

  applyManatDelta: (delta: number) => void;

  refreshUserId: () => void;

}



const UserContext = createContext<UserContextType | undefined>(undefined);



function resolveUserId(firebaseUser: User | null): string {

  const localId = getLocalProfileUserId();

  if (localId) return localId;

  if (firebaseUser?.uid) return firebaseUser.uid;

  if (firebaseUser?.email) return firebaseUser.email;

  return 'anonim_user_id';

}



function resolveDisplayName(firebaseUser: User | null): string {

  if (firebaseUser?.displayName) return firebaseUser.displayName;

  if (firebaseUser?.email) return firebaseUser.email;

  return getLocalProfileDisplayName();

}



export function UserProvider({ children }: { children: React.ReactNode }) {

  const [user, setUser] = useState<User | null>(null);

  const [userId, setUserId] = useState('anonim_user_id');

  const [manat, setManat] = useState(0);

  const [manatReady, setManatReady] = useState(false);

  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);

  const [profileReady, setProfileReady] = useState(false);

  const pendingManatDeltaRef = useRef(0);



  const refreshUserId = useCallback(() => {

    setUserId(resolveUserId(user));

  }, [user]);



  const applyManatDelta = useCallback((delta: number) => {

    if (!delta) return;

    pendingManatDeltaRef.current += delta;

    setManat((prev) => Math.max(0, prev + delta));

  }, []);



  useEffect(() => {

    clearLegacyBalanceStorage();

    void ensureFirebaseAuth();



    const applyId = () => {

      const localId = getLocalProfileUserId();

      if (localId) setUserId(localId);

    };



    applyId();

    window.addEventListener('yolustu_user_updated', applyId);

    window.addEventListener('storage', applyId);



    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {

      setUser(firebaseUser);

      const localId = getLocalProfileUserId();

      setUserId(localId || resolveUserId(firebaseUser));

    });



    return () => {

      unsubscribe();

      window.removeEventListener('yolustu_user_updated', applyId);

      window.removeEventListener('storage', applyId);

    };

  }, []);



  useEffect(() => {

    if (!userId || userId === 'anonim_user_id') {

      setManat(0);

      setManatReady(true);

      setProfileReady(true);

      return;

    }



    setManatReady(false);

    const displayName = resolveDisplayName(user);

    let cancelled = false;



    void ensurePlayerProfile(userId, displayName, user?.uid ?? null).then(() => {

      if (!cancelled) setProfileReady(true);

    });



    const ref = doc(db, 'players', userId);

    const unsub = onSnapshot(

      ref,

      (snap) => {

        if (snap.exists()) {

          const raw = snap.data() as Record<string, unknown>;

          const nextManat = resolvePlayerManat(raw);

          setPlayerProfile({ ...(raw as unknown as PlayerProfile), odId: userId, manat: nextManat });

          pendingManatDeltaRef.current = 0;

          setManat(nextManat);

        } else {

          setPlayerProfile(null);

          pendingManatDeltaRef.current = 0;

          setManat(0);

        }

        setManatReady(true);

      },

      (err) => {

        console.error('Firebase players dinləyicisi xətası:', err);

        setManatReady(true);

      }

    );



    return () => {

      cancelled = true;

      unsub();

    };

  }, [userId, user?.displayName, user?.email, user?.uid]);



  useEffect(() => {

    if (!userId || userId === 'anonim_user_id') return;

    if (!user?.uid || user.uid === userId) return;



    const reconcileKey = `player_reconciled_${userId}_${user.uid}`;

    if (typeof window !== 'undefined' && sessionStorage.getItem(reconcileKey) === '1') return;



    void reconcilePlayerIdentity(userId, user.uid, resolveDisplayName(user)).then(() => {

      if (typeof window !== 'undefined') sessionStorage.setItem(reconcileKey, '1');

    });

  }, [userId, user?.uid, user?.displayName, user?.email]);



  const addManat = useCallback(

    async (amount: number) => {

      if (amount <= 0 || !userId || userId === 'anonim_user_id') return;

      applyManatDelta(amount);

      const ref = doc(db, 'players', userId);

      try {

        await runTransaction(db, async (tx) => {

          const snap = await tx.get(ref);

          const current = snap.exists()

            ? resolvePlayerManat(snap.data() as Record<string, unknown>)

            : 0;

          tx.set(ref, { ...manatWritePatch(current + amount), updatedAt: Date.now() }, { merge: true });

        });

      } catch (err) {

        applyManatDelta(-amount);

        throw err;

      }

    },

    [userId, applyManatDelta]

  );



  const spendManat = useCallback(

    async (amount: number) => {

      if (amount <= 0 || !userId || userId === 'anonim_user_id') return false;

      applyManatDelta(-amount);

      const ref = doc(db, 'players', userId);

      try {

        await runTransaction(db, async (tx) => {

          const snap = await tx.get(ref);

          const current = snap.exists()

            ? resolvePlayerManat(snap.data() as Record<string, unknown>)

            : 0;

          if (current < amount) throw new Error('insufficient');

          tx.set(ref, { ...manatWritePatch(current - amount), updatedAt: Date.now() }, { merge: true });

        });

        return true;

      } catch {

        applyManatDelta(amount);

        return false;

      }

    },

    [userId, applyManatDelta]

  );



  const value: UserContextType = {

    user,

    userId,

    manat,

    manatReady,

    playerProfile,

    addManat,

    spendManat,

    applyManatDelta,

    refreshUserId,

  };



  if (!profileReady && userId !== 'anonim_user_id') {

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;

  }



  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;

}



export function useUser() {

  const context = useContext(UserContext);

  if (!context) {

    throw new Error('useUser must be used within a UserProvider');

  }

  return context;

}


