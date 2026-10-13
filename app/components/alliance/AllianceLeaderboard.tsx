// components/alliance/AllianceLeaderboard.tsx
import React from 'react';
import { AllianceData } from './types';

interface LeaderboardProps {
    alliances: AllianceData[];
}

export default function AllianceLeaderboard({ alliances }: LeaderboardProps) {
    const sortedAlliances = [...alliances].sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '18px', border: '2px solid #0f172a', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.04)' }}>
            <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 18px', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' }}>
                🏆 KLAN İTTİFAQ REYTİNQİ
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {sortedAlliances.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '10px' }}>Hələ heç bir klan yaradılmayıb.</div>
                ) : (
                    sortedAlliances.map((item, index) => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: index === 0 ? '#fffbeb' : '#f8fafc', borderRadius: '8px', border: index === 0 ? '1px solid #f59e0b' : '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 900, fontSize: '12px', color: index === 0 ? '#d97706' : '#64748b', width: '18px' }}>#{index + 1}</span>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>{item.name}</span>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#4f46e5', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: '6px' }}>{item.score || 50} xal</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}