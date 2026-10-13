// components/alliance/AllianceFinder.tsx
"use client";

import React, { useState } from 'react';
import { AllianceData } from './types';

interface AllianceFinderProps {
    alliances: AllianceData[];
    activeAlliance: AllianceData | null;
    regions: string[];
    onJoinAlliance: (alliance: AllianceData) => void;
}

export default function AllianceFinder({ alliances, activeAlliance, regions, onJoinAlliance }: AllianceFinderProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [regionFilter, setRegionFilter] = useState('Hamısı');

    const filteredAlliances = alliances.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
        const matchesRegion = regionFilter === 'Hamısı' || item.region === regionFilter;
        return matchesSearch && matchesRegion;
    });

    return (
        <div style={{ backgroundColor: '#ffffff', borderRadius: '18px', border: '2px solid #0f172a', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.04)' }}>
            <div style={{ backgroundColor: '#0f172a', color: '#ffffff', padding: '12px 18px', fontSize: '11px', fontWeight: 800, letterSpacing: '1px' }}>
                🔍 CANLI AXTARIŞ VƏ BÖLGƏLƏR
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input 
                        type="text" 
                        placeholder="Klan adını yazın (məs: Qarabağ)..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ flex: 1, minWidth: '180px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '12px', outline: 'none' }}
                    />
                    <select 
                        value={regionFilter} 
                        onChange={(e) => setRegionFilter(e.target.value)}
                        style={{ flex: 1, minWidth: '220px', padding: '10px', borderRadius: '10px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                    >
                        <option value="Hamısı">Bütün Azərbaycan Rayonları</option>
                        {regions.map(reg => (
                            <option key={reg} value={reg}>{reg}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', marginTop: '6px' }}>
                    {filteredAlliances.length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '10px' }}>Heç bir klan tapılmadı.</div>
                    ) : (
                        filteredAlliances.map((item) => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>🛡️ {item.name}</div>
                                    <div style={{ fontSize: '10px', color: '#64748b' }}>Lider: {item.leader} | Üzvlər: {item.members?.length || 0} nəfər</div>
                                </div>
                                {activeAlliance?.id !== item.id && !activeAlliance && (
                                    <button 
                                        onClick={() => onJoinAlliance(item)}
                                        style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}
                                    >
                                        Qoşul ➕
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}