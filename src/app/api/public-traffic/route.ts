// Public traffic aggregator: returns NL+BE pageviews for all websites across
// 24h / 7d / 30d windows. Guarded by ?key=SECRET from PUBLIC_TRAFFIC_KEY env var.
//
// Uses raw SQL via prisma.client for efficient GROUP BY per-site per-country.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type Row = {
  domain: string;
  nlbe_pv: number; nlbe_v: number;
  total_pv: number; total_v: number;
  top: string;
};

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
    // Raw SQL: count BOTH pageviews (all rows) AND unique visits (DISTINCT visit_id)
    // per domain × country.
    const rows: { domain: string; country: string | null; pv: bigint; v: bigint }[] =
      await prisma.client.$queryRaw`
        SELECT w.domain AS domain,
               s.country AS country,
               COUNT(*) AS pv,
               COUNT(DISTINCT e.visit_id) AS v
        FROM website_event e
        JOIN website w ON w.website_id = e.website_id
        JOIN session s ON s.session_id = e.session_id
        WHERE e.event_type = 1
          AND e.created_at >= ${since}
          AND w.deleted_at IS NULL
        GROUP BY w.domain, s.country
      `;

    const bucket = new Map<string, {
      nlbe_pv: number; nlbe_v: number;
      total_pv: number; total_v: number;
      tops: { c: string; n: number }[];
    }>();
    for (const r of rows) {
      const domain = r.domain;
      const pv = Number(r.pv);
      const v = Number(r.v);
      const country = r.country || '??';
      let b = bucket.get(domain);
      if (!b) { b = { nlbe_pv: 0, nlbe_v: 0, total_pv: 0, total_v: 0, tops: [] }; bucket.set(domain, b); }
      b.total_pv += pv;
      b.total_v += v;
      if (country === 'NL' || country === 'BE') { b.nlbe_pv += pv; b.nlbe_v += v; }
      b.tops.push({ c: country, n: pv });
    }

    const all = await prisma.client.website.findMany({
      where: { deletedAt: null },
      select: { domain: true },
    });
    const result: Row[] = all.map((site) => {
      const b = bucket.get(site.domain);
      if (!b) return { domain: site.domain, nlbe_pv: 0, nlbe_v: 0, total_pv: 0, total_v: 0, top: '' };
      b.tops.sort((a, b) => b.n - a.n);
      return {
        domain: site.domain,
        nlbe_pv: b.nlbe_pv, nlbe_v: b.nlbe_v,
        total_pv: b.total_pv, total_v: b.total_v,
        top: b.tops.slice(0, 3).map((x) => `${x.c}=${x.n}`).join(', '),
      };
    });
    result.sort((a, b) => b.nlbe_pv - a.nlbe_pv);
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
