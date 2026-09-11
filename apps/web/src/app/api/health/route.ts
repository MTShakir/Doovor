import { connection } from 'next/server';

/** Liveness check for uptime monitoring (PRD 14.5). Database and job checks join in M6. */
export async function GET() {
  await connection();
  return Response.json(
    { status: 'ok', time: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
