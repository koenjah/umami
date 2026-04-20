// Public traffic aggregator: returns NL+BE pageviews for all websites across
// 24h / 7d / 30d windows. Guarded by ?key=SECRET from PUBLIC_TRAFFIC_KEY env var.
//
// Uses raw SQL via prisma.client for efficient GROUP BY per-site per-country.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Row = { domain: string; nlbe: number; total: number; top: string };

const WINDOWS = [
  { label: 'd1', days: 1 },
  { label: 'd7', days: 7 },
  { label: 'd30', days: 30 },
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const expected = process.env.PUBLIC_TRAFFIC_KEY || '';
  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const out: Record<string, Row[]> = {};

  for (const w of WINDOWS) {
    const since = new Date(Date.now() - w.days * 86400 * 1000);
    // Raw SQL: join website + session + event, group by domain + country,
    // count pageviews.  PostgreSQL-specific.
    const rows: { domain: string; country: string | null; n: bigint }[] =
      await prisma.client.$queryRaw`
        SELECT w.domain AS domain,
               s.country AS country,
               COUNT(*) AS n
        FROM website_event e
        JOIN website w ON w.website_id = e.website_id
        JOIN session s ON s.session_id = e.session_id
        WHERE e.event_type = 1
          AND e.created_at >= ${since}
          AND w.deleted_at IS NULL
        GROUP BY w.domain, s.country
      `;

    // Aggregate per-domain
    const bucket = new Map<string, { nlbe: number; total: number; tops: { c: string; n: number }[] }>();
    for (const r of rows) {
      const domain = r.domain;
      const n = Number(r.n);
      const country = r.country || '??';
      let b = bucket.get(domain);
      if (!b) { b = { nlbe: 0, total: 0, tops: [] }; bucket.set(domain, b); }
      b.total += n;
      if (country === 'NL' || country === 'BE') b.nlbe += n;
      b.tops.push({ c: country, n });
    }

    // Make sure every website shows up even if 0 traffic
    const all = await prisma.client.website.findMany({
      where: { deletedAt: null },
      select: { domain: true },
    });
    const result: Row[] = all.map((w) => {
      const b = bucket.get(w.domain);
      if (!b) return { domain: w.domain, nlbe: 0, total: 0, top: '' };
      b.tops.sort((a, b) => b.n - a.n);
      return {
        domain: w.domain,
        nlbe: b.nlbe,
        total: b.total,
        top: b.tops.slice(0, 3).map((x) => `${x.c}=${x.n}`).join(', '),
      };
    });
    result.sort((a, b) => b.nlbe - a.nlbe);
    out[w.label] = result;
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    data: out,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
