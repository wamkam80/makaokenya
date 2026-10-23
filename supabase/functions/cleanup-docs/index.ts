// Deletes the ID and ownership documents of verification requests that were
// rejected more than 83 days ago (the privacy policy promises within 90 days).
// It takes no input and only ever does this one clean-up, so it is safe to
// call publicly; the twice-weekly GitHub job calls it.
// Deployed with verify_jwt = false.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DAYS = 83;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false }
  });
  const cutoff = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();

  const { data: rows, error } = await sb
    .from('verification_requests')
    .select('id, id_doc_path, deed_doc_path')
    .eq('status', 'rejected')
    .is('docs_deleted_at', null)
    .lt('reviewed_at', cutoff)
    .limit(200);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  let deleted = 0;
  for (const r of rows ?? []) {
    const paths = [r.id_doc_path, r.deed_doc_path].filter(Boolean);
    const { error: rmErr } = await sb.storage.from('verification-docs').remove(paths);
    if (rmErr) continue;
    const { error: upErr } = await sb.from('verification_requests')
      .update({ docs_deleted_at: new Date().toISOString() }).eq('id', r.id);
    if (!upErr) deleted++;
  }
  return Response.json({ ok: true, checked: rows?.length ?? 0, deleted });
});
