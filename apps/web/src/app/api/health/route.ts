// Liveness probe for the web service (railway-deployment.md §1: web health = /api/health).
export function GET() {
  return Response.json({ status: 'ok' });
}
