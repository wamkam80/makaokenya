// TrueHome Kenya – connection settings
//
// Leave both values empty to run the site in DEMO MODE
// (sample listings, data saved only in each visitor's browser).
//
// To go live, paste your Supabase project's values here
// (Supabase dashboard → Project Settings → API). See SUPABASE_SETUP.md.
//
// The anon / publishable key is meant to be public. It is safe to commit:
// the database security rules in supabase/schema.sql decide what it can do.
// NEVER paste the "service_role" or "secret" key here.

window.TRUEHOME_CONFIG = {
  supabaseUrl: '',      // e.g. 'https://abcdefghijklm.supabase.co'
  supabaseAnonKey: ''   // e.g. 'eyJhbGciOi...' or 'sb_publishable_...'
};
