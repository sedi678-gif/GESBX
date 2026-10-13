"use client";

import { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, limit, onSnapshot, orderBy, query, where, type QuerySnapshot } from 'firebase/firestore';
import { AllianceData, MessageData } from './types';

export function useAllianceData(currentUserId: string) {
    const [alliances, setAlliances] = useState<AllianceData[]>([]);
    const [activeAlliance, setActiveAlliance] = useState<AllianceData | null>(null);
    const [messages, setMessages] = useState<MessageData[]>([]);

    useEffect(() => {
        const q = query(collection(db, 'alliances'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: AllianceData[] = [];
            snapshot.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() } as AllianceData);
            });
            setAlliances(list);

            const myAlliance = list.find(item =>
                item.leaderId === currentUserId || (item.members && item.members.includes(currentUserId))
            );
            setActiveAlliance(myAlliance || null);
        }, (error) => {
            console.error("İttifaqları oxuma xətası:", error);
        });

        return () => unsubscribe();
    }, [currentUserId]);

    useEffect(() => {
        if (!activeAlliance?.id) {
            setMessages([]);
            return;
        }

        const allianceId = activeAlliance.id;
        const applySnap = (snapshot: QuerySnapshot) => {
            const msgList: MessageData[] = [];
            snapshot.forEach((docSnap) => {
                msgList.push({ id: docSnap.id, ...docSnap.data() } as MessageData);
            });
            msgList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            setMessages(msgList.length > 0 ? msgList.slice(-80) : [
                { id: '1', user: 'Sistem', text: 'Canlı ittifaq söhbətinə xoş gəldiniz! 🇦🇿', time: 'İndi', createdAt: Date.now() }
            ]);
        };

        const scoped = query(
            collection(db, 'alliance_chat'),
            where('allianceId', '==', allianceId),
            orderBy('createdAt', 'desc'),
            limit(80)
        );
        let fallbackUnsub: (() => void) | null = null;
        const unsubscribe = onSnapshot(scoped, applySnap, () => {
            fallbackUnsub = onSnapshot(
                query(collection(db, 'alliance_chat'), where('allianceId', '==', allianceId)),
                applySnap
            );
        });

        return () => {
            unsubscribe();
            fallbackUnsub?.();
        };
    }, [activeAlliance?.id]);

    return { alliances, activeAlliance, messages, setActiveAlliance };
}
