'use client';
import { useEffect, useMemo, useState } from 'react';
import { Column } from '@umami/react-zen';
import { PageBody } from '@/components/common/PageBody';
import { PageHeader } from '@/components/common/PageHeader';
import { useMessages } from '@/components/hooks';

type Row = { id: string; name: string; domain: string; visitors: number; pageviews: number };
type SortKey = 'name' | 'domain' | 'visitors' | 'pageviews';
const PERIODS = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
];

async function fetchAllWebsites(): Promise<any[]> {
  const all: any[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(`/api/websites?page=${page}&pageSize=200`);
    if (!r.ok) break;
    const j = await r.json();
    const batch = Array.isArray(j) ? j : j.data || [];
    all.push(...batch);
    if (batch.length < 200) break;
    page++;
    if (page > 10) break;
  }
  return all;
}

async function fetchStats(id: string, startAt: number, endAt: number): Promise<{ visitors: number; pageviews: number }> {
  try {
    const r = await fetch(`/api/websites/${id}/stats?startAt=${startAt}&endAt=${endAt}`);
    if (!r.ok) return { visitors: 0, pageviews: 0 };
    const j = await r.json();
    const num = (x: any) => (typeof x === 'number' ? x : (x?.value ?? 0));
    return { visitors: num(j.visitors), pageviews: num(j.pageviews) };
  } catch {
    return { visitors: 0, pageviews: 0 };
  }
}

export function DashboardPage() {
  const { formatMessage, labels } = useMessages();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<Row[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('visitors');
  const [sortDesc, setSortDesc] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setProgress({ done: 0, total: 0 });
      const sites = await fetchAllWebsites();
      if (cancelled) return;
      setProgress({ done: 0, total: sites.length });
      const endAt = Date.now();
      const startAt = endAt - days * 86400 * 1000;
      const out: Row[] = [];
      const batchSize = 20;
      for (let i = 0; i < sites.length; i += batchSize) {
        if (cancelled) return;
        const batch = sites.slice(i, i + batchSize);
        const stats = await Promise.all(batch.map((s) => fetchStats(s.id, startAt, endAt)));
        batch.forEach((s, idx) => {
          out.push({ id: s.id, name: s.name, domain: s.domain, ...stats[idx] });
        });
        setProgress({ done: out.length, total: sites.length });
        setRows([...out]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number') return sortDesc ? bv - av : av - bv;
      return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
    });
    return arr;
  }, [rows, sortKey, sortDesc]);

  const totalV = rows.reduce((s, r) => s + r.visitors, 0);
  const totalP = rows.reduce((s, r) => s + r.pageviews, 0);

  function header(label: string, key: SortKey, align: 'left' | 'right' = 'left') {
    const active = sortKey === key;
    return (
      <th
        onClick={() => {
          if (active) setSortDesc(!sortDesc);
          else { setSortKey(key); setSortDesc(true); }
        }}
        style={{
          padding: '10px 12px', textAlign: align, cursor: 'pointer',
          background: '#fafafa', borderBottom: '1px solid #e5e5e5',
          userSelect: 'none', position: 'sticky', top: 0,
          fontWeight: 600, fontSize: 13,
        }}
      >
        {label} {active ? (sortDesc ? '▼' : '▲') : ''}
      </th>
    );
  }

  return (
    <PageBody>
      <Column gap="6" margin="2">
        <PageHeader title={formatMessage(labels.dashboard)} />
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => setDays(p.days)}
              style={{
                padding: '6px 14px', border: '1px solid #ddd', borderRadius: 6,
                background: days === p.days ? '#1c1917' : '#fff',
                color: days === p.days ? '#fff' : '#333',
                cursor: 'pointer', fontSize: 13,
              }}
            >
              {p.label}
            </button>
          ))}
          <span style={{ marginLeft: 16, color: '#666', fontSize: 13 }}>
            {loading
              ? `Loading… ${progress.done}/${progress.total}`
              : `${rows.length} sites · ${totalV.toLocaleString()} visitors · ${totalP.toLocaleString()} pageviews`}
          </span>
        </div>
        <div style={{ overflow: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {header('#', 'name')}
                {header('Domain', 'domain')}
                {header('Visitors', 'visitors', 'right')}
                {header('Pageviews', 'pageviews', 'right')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px', color: '#999', width: 40 }}>{i + 1}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <a
                      href={`/websites/${r.id}`}
                      style={{ color: '#1c1917', textDecoration: 'none', fontWeight: 500 }}
                    >
                      {r.domain || r.name}
                    </a>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.visitors.toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.pageviews.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Column>
    </PageBody>
  );
}
// build-marker-v2
