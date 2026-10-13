"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useAllianceBrain } from './AllianceBrainContext';
import { AZ_ALL_REGIONS } from './regionCoords';
import { formatCardTotal } from './battleCardsConfig';

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const cardHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  backgroundColor: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  fontSize: '11px',
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '0.5px',
};

const cardBodyStyle: React.CSSProperties = {
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  gap: '12px',
};

const iconBoxStyle: React.CSSProperties = {
  width: '42px',
  height: '42px',
  borderRadius: '10px',
  backgroundColor: '#eef2ff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
};

const primaryBtn: React.CSSProperties = {
  flex: 1,
  padding: '12px 10px',
  borderRadius: '10px',
  border: 'none',
  backgroundColor: '#4f46e5',
  color: '#fff',
  fontWeight: 800,
  fontSize: '12px',
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  padding: '12px 10px',
  borderRadius: '10px',
  border: '2px solid #4f46e5',
  backgroundColor: '#ffffff',
  color: '#4f46e5',
  fontWeight: 800,
  fontSize: '12px',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  fontSize: '12px',
  boxSizing: 'border-box',
};

interface AllianceProfileCardProps {
  title?: string;
}

function AllianceProfileCardInner({ title = 'İTTİFAQ (ALLIANCE)' }: AllianceProfileCardProps) {
  const {
    alliances,
    activeAlliance,
    battleCards,
    handleCreateAlliance,
    handleJoinAlliance,
    handleLeaveAlliance,
    notifyAllianceInfoViewed,
  } = useAllianceBrain();

  const [mode, setMode] = useState<'none' | 'create' | 'join'>('none');
  const [allianceName, setAllianceName] = useState('');
  const [regionFilter, setRegionFilter] = useState('Bakı');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const showStatus = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await handleCreateAlliance(allianceName, regionFilter);
      setAllianceName('');
      setMode('none');
      showStatus(`"${allianceName}" ittifaqı yaradıldı!`);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Xəta baş verdi');
    }
  };

  const handleJoin = async (allianceId: string) => {
    const item = alliances.find((a) => a.id === allianceId);
    if (!item) return;
    try {
      await handleJoinAlliance(item);
      setMode('none');
      showStatus(`"${item.name}" ittifaqına qoşuldunuz!`);
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Qoşulma xətası');
    }
  };

  const handleLeave = async () => {
    try {
      await handleLeaveAlliance();
      showStatus('İttifaqdan ayrıldınız.');
    } catch (error) {
      console.error(error);
    }
  };

  const joinCandidates = alliances.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const cardTotal = formatCardTotal(battleCards);

  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>{title}</div>
      <div style={cardBodyStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={iconBoxStyle}>🛡️</div>
          <div>
            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
              {activeAlliance ? 'Aktiv İttifaq' : 'Aktiv İttifaq yoxdur'}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              {activeAlliance ? activeAlliance.name : 'Hələ heç bir ittifaqa qoşulmamısan'}
            </div>
            {activeAlliance && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                📍 {activeAlliance.region} · Lider: {activeAlliance.leader} · {activeAlliance.score} xal
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#6366f1', marginTop: '4px', fontWeight: 700 }}>
              Döyüş kartları: {cardTotal} ədəd
            </div>
          </div>
        </div>

        {statusMsg && (
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '8px 10px', borderRadius: '8px' }}>
            {statusMsg}
          </div>
        )}

        {activeAlliance ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Link href="/alliance" style={{ textDecoration: 'none' }}>
              <button type="button" style={{ ...primaryBtn, width: '100%' }}>
                🗺️ İttifaq Xəritəsinə Keç
              </button>
            </Link>
            <button type="button" onClick={handleLeave} style={{ ...secondaryBtn, width: '100%', borderColor: '#ef4444', color: '#ef4444' }}>
              İttifaqdan Çıx
            </button>
          </div>
        ) : mode === 'none' ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={primaryBtn} onClick={() => setMode('create')}>
              ➕ İttifaq Yarat
            </button>
            <button type="button" style={secondaryBtn} onClick={() => setMode('join')}>
              🔍 Qoşul
            </button>
          </div>
        ) : mode === 'create' ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              style={inputStyle}
              placeholder="İttifaq adı (məs: Qarabağ)"
              value={allianceName}
              onChange={(e) => setAllianceName(e.target.value)}
              required
            />
            <select style={inputStyle} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
              {AZ_ALL_REGIONS.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={primaryBtn}>Yarat</button>
              <button type="button" style={secondaryBtn} onClick={() => setMode('none')}>Ləğv</button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              style={inputStyle}
              placeholder="İttifaq adını axtar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {joinCandidates.length === 0 ? (
                <span style={{ fontSize: '12px', color: '#64748b' }}>Nəticə yoxdur.</span>
              ) : (
                joinCandidates.map((item) => (
                  <div
                    key={item.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  >
                    <button
                      type="button"
                      onClick={() => notifyAllianceInfoViewed(item)}
                      style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 800 }}>{item.name}</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>📍 {item.region}</div>
                    </button>
                    <button type="button" style={{ ...primaryBtn, flex: 'none', padding: '6px 12px', fontSize: '11px' }} onClick={() => handleJoin(item.id)}>
                      Qoşul
                    </button>
                  </div>
                ))
              )}
            </div>
            <button type="button" style={secondaryBtn} onClick={() => setMode('none')}>Geri</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AllianceProfileCard(props: AllianceProfileCardProps) {
  return <AllianceProfileCardInner {...props} />;
}
