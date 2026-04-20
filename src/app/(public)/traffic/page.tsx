'use client';
// Publicly accessible traffic dashboard — no Umami login required.
// Guarded by ?key=SECRET query param. Fetches /api/public-traffic which
// queries the Postgres DB directly and returns aggregated counts.

import { useEffect, useMemo, useState } from 'react';

type Row = { domain: string; nlbe: number; total: number; top: string };
type Win = 'd1' | 'd7' | 'd30';
type SortKey = 'domain' | 'nlbe' | 'total' | 'pct';

export default function TrafficPage() {
  const [data, setData] = useState<Record<Win, Row[]> | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [win, setWin] = useState<Win>('d1');
  const [sortKey, setSortKey] = useState<SortKey>('nlbe');
  const [sortDesc, setSortDesc] = useState(true);
  const [key, setKey] = useState<string>('');

  useEffect(() => {
    const urlKey = new URLSearchParams(window.location.search).get('key');
    if (urlKey) setKey(urlKey);
  }, []);

  const load = async (k: string) => {
    if (!k) return;
    setErr(''); setData(null);
    try {
      const r = await fetch(`/api/public-traffic?key=${encodeURIComponent(k)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j.data); setGeneratedAt(j.generatedAt);
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  };

  useEffect(() => { if (key) load(key); }, [key]);

  const rows = useMemo(() => {
    if (!data) return [];
    const base = [...data[win]].filter((r) => r.nlbe > 0 || r.total > 0);
    base.sort((a, b) => {
      if (sortKey === 'domain')
        return sortDesc ? b.domain.localeCompare(a.domain) : a.domain.localeCompare(b.domain);
      const av = sortKey === 'pct' ? (a.total ? a.nlbe / a.total : 0) : (a as any)[sortKey];
      const bv = sortKey === 'pct' ? (b.total ? b.nlbe / b.total : 0) : (b as any)[sortKey];
      return sortDesc ? bv - av : av - bv;
    });
    return base;
  }, [data, win, sortKey, sortDesc]);

  const totNlbe = rows.reduce((s, r) => s + r.nlbe, 0);
  const totAll = rows.reduce((s, r) => s + r.total, 0);
  const pct = totAll ? (totNlbe / totAll * 100).toFixed(1) : '0';

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc(!sortDesc);
    else { setSortKey(k); setSortDesc(k !== 'domain'); }
  };

  const arrow = (k: SortKey) => (sortKey === k ? (sortDesc ? ' ▼' : ' ▲') : '');

  const css = `
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f6f6f5;color:#1c1917;margin:0;padding:2rem 1rem}
    .wrap{max-width:1200px;margin:0 auto}
    h1{font-size:1.4rem;margin:0 0 .2rem}
    .sub{color:#666;font-size:.9rem;margin-bottom:1rem}
    .tabs{display:flex;gap:.5rem;margin-bottom:1rem;align-items:center;flex-wrap:wrap}
    .tabs button{padding:.5rem 1rem;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:#fff;font-size:.95rem}
    .tabs button.act{background:#1c1917;color:#fff;border-color:#1c1917}
    .tabs .refresh{padding:.5rem .9rem;background:#0a7;color:#fff;border:0;border-radius:6px;cursor:pointer;margin-left:auto}
    .card{background:#fff;border-radius:8px;padding:1rem;box-shadow:0 1px 2px rgba(0,0,0,.05)}
    .summary{background:#f5f5f4;padding:.8rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:.9rem}
    .tip{background:#fef3c7;padding:.6rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:.85rem;color:#78350f}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #eee}
    th{cursor:pointer;background:#fafafa;position:sticky;top:0;font-weight:600;user-select:none}
    th:hover{background:#eee}
    td:nth-child(3),td:nth-child(4),td:nth-child(5),th:nth-child(3),th:nth-child(4),th:nth-child(5){text-align:right}
    tr:hover{background:#f9f9f9}
    a{color:#1c1917;text-decoration:none}
    a:hover{text-decoration:underline}
    .err{background:#fee;padding:1rem;border-radius:6px;color:#c00;margin-top:1rem}
  `;

  return (
    <>
      <style>{css}</style>
      <div className="wrap">
        <h1>Umami traffic — NL + BE</h1>
        <div className="sub">
          {generatedAt ? `Laatste update: ${new Date(generatedAt).toLocaleString('nl-NL')}` : 'Loading…'}
          {' · '}Edge-cached voor 5 min
        </div>

        {!key && (
          <div className="card">
            <div style={{ marginBottom: 8 }}>Geef de toegangssleutel op:</div>
            <input
              type="password"
              placeholder="Access key"
              onKeyDown={(e: any) => {
                if (e.key === 'Enter') {
                  setKey(e.target.value);
                  window.history.replaceState({}, '', `?key=${encodeURIComponent(e.target.value)}`);
                }
              }}
              style={{ padding: '.5rem', border: '1px solid #ccc', borderRadius: 6, width: 260 }}
            />
          </div>
        )}

        {err && <div className="err">Error: {err}</div>}

        {data && (
          <>
            <div className="tabs">
              <button className={win === 'd1' ? 'act' : ''} onClick={() => setWin('d1')}>24u</button>
              <button className={win === 'd7' ? 'act' : ''} onClick={() => setWin('d7')}>7 dagen</button>
              <button className={win === 'd30' ? 'act' : ''} onClick={() => setWin('d30')}>30 dagen</button>
              <button className="refresh" onClick={() => load(key)}>↻ Refresh</button>
            </div>

            <div className="tip">
              <b>%NL/BE</b> = schone traffic. Groen ≥50% = echte users. Rood &lt;20% = Azië-bots.
            </div>

            <div className="summary">
              <b>{rows.length}</b> sites met traffic · <b>{totNlbe.toLocaleString()}</b> NL/BE pageviews
              · <b>{totAll.toLocaleString()}</b> totaal · <b>{pct}%</b> NL/BE ratio
            </div>

            <div className="card" style={{ padding: 0, overflow: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th onClick={() => setSort('domain')}>domain{arrow('domain')}</th>
                    <th onClick={() => setSort('nlbe')}>NL+BE{arrow('nlbe')}</th>
                    <th onClick={() => setSort('total')}>all{arrow('total')}</th>
                    <th onClick={() => setSort('pct')}>%NL/BE{arrow('pct')}</th>
                    <th>top countries</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p = r.total ? (r.nlbe / r.total * 100) : 0;
                    const col = p >= 50 ? '#080' : p >= 20 ? '#a40' : '#c00';
                    return (
                      <tr key={r.domain}>
                        <td>{i + 1}</td>
                        <td>
                          <a href={`https://${r.domain}/`} target="_blank" rel="noreferrer">{r.domain}</a>
                        </td>
                        <td>{r.nlbe.toLocaleString()}</td>
                        <td>{r.total.toLocaleString()}</td>
                        <td style={{ color: col }}>{p.toFixed(0)}%</td>
                        <td style={{ color: '#888', fontSize: '.85em' }}>{r.top}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
