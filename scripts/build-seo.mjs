// Builds pages that Google can read, from the live listings in Supabase:
//   /homes/<slug>/            one page per live listing
//   /rent/<area>/, /buy/<area>/            listings in an area
//   /rent/<type>/, /buy/<type>/            listings of a type across Kenya
//   /rent/, /buy/                           all listings
//   /guides/, /guides/<slug>/               scam-prevention guides
//   /sitemap.xml
// Run by .github/workflows/build-pages.yml every day. Run locally with
// `node scripts/build-seo.mjs --offline` to rebuild guides only.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { GUIDES } from './guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://truehomekenya.com';
const OFFLINE = process.argv.includes('--offline');
const TODAY = new Date().toISOString().slice(0, 10);

// ---- Shared catalogue: read TYPES, KINDS, FEATURE_GROUPS, LOCATIONS from index.html ----
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const grab = (start, end) => {
  const i = html.indexOf(start);
  const j = html.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('Could not find ' + start + ' in index.html');
  return html.slice(i, j);
};
const ctx = {};
vm.createContext(ctx);
vm.runInContext(
  grab('const TYPES = {', '\n    };') + '\n    };\n' +
  grab('const KINDS = {', 'const groupsFor') +
  grab('const LOCATIONS = [', 'const locByName') +
  ';this.TYPES=TYPES;this.KINDS=KINDS;this.KIND_LABEL=KIND_LABEL;this.FEATURE_GROUPS=FEATURE_GROUPS;this.FEATURE_LABEL=FEATURE_LABEL;this.LOCATIONS=LOCATIONS;',
  ctx
);
const { TYPES, KIND_LABEL, FEATURE_GROUPS, FEATURE_LABEL, LOCATIONS } = ctx;

// ---- Helpers ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const money = (n) => 'KES ' + Number(n).toLocaleString('en-KE');
const priceText = (l) => money(l.price) + (l.purpose === 'rent' ? ' /month' : '');
const purposePath = (p) => (p === 'rent' ? 'rent' : 'buy');
const TYPE_PLURAL = { apartment: 'Apartments', house: 'Houses & maisonettes', bedsitter: 'Bedsitters & single rooms', land: 'Land & plots', commercial: 'Shops & offices' };
const TYPE_SLUG = { apartment: 'apartments', house: 'houses', bedsitter: 'bedsitters', land: 'land', commercial: 'commercial' };
const listingSlug = (l) => `${slug(l.title)}-${slug(l.location)}-${String(l.id).replace(/-/g, '').slice(0, 8)}`;
const listingPath = (l) => `/homes/${listingSlug(l)}/`;
const typeLabel = (l) => KIND_LABEL[l.kind] || (TYPES[l.type] || {}).label || 'Property';
const photosOf = (l) => (Array.isArray(l.photos) && l.photos.length ? l.photos : l.photo_url ? [l.photo_url] : []);

function write(rel, content) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function page({ title, description, canonical, image, jsonld, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${SITE}${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="TrueHome Kenya">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${SITE}${canonical}">
  ${image ? `<meta property="og:image" content="${esc(image)}">\n  <meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>if (window.tailwind) tailwind.config = { theme: { extend: { fontFamily: { sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] }, colors: { ink: '#0b1f17' } } } };</script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    h1, h2, h3 { text-wrap: balance; letter-spacing: -0.015em; }
    .prose h2 { font-size: 1.35rem; font-weight: 800; margin: 2rem 0 .6rem; color: #0f172a; }
    .prose p, .prose li { line-height: 1.75; color: #334155; }
    .prose p { margin: .8rem 0; }
    .prose ul, .prose ol { margin: .6rem 0 .6rem 1.4rem; }
    .prose ul { list-style: disc; } .prose ol { list-style: decimal; }
    .prose li { margin: .35rem 0; }
    .prose a { color: #047857; text-decoration: underline; font-weight: 600; }
    .prose .lead { font-size: 1.15rem; color: #1e293b; }
    .prose .note { font-size: .85rem; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 1rem; margin-top: 2rem; }
    .prose ul.checks { list-style: none; margin-left: 0; }
    .prose ul.checks li::before { content: "\\2610"; margin-right: .6rem; color: #059669; font-weight: 700; }
  </style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-900 antialiased">
  <header class="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
      <a href="/" class="flex shrink-0 items-center gap-2.5" aria-label="TrueHome Kenya home">
        <span class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-sm"><i class="fa-solid fa-house-circle-check text-[15px]"></i></span>
        <span class="whitespace-nowrap text-[17px] font-extrabold tracking-tight text-ink sm:text-lg">TrueHome<span class="font-semibold text-emerald-700"> Kenya</span></span>
      </a>
      <nav class="hidden items-center gap-6 text-[15px] font-semibold text-slate-600 lg:flex" aria-label="Main">
        <a href="/#browse" class="hover:text-slate-900">Browse homes</a>
        <a href="/rent/" class="hover:text-slate-900">To rent</a>
        <a href="/buy/" class="hover:text-slate-900">For sale</a>
        <a href="/#phone" class="hover:text-slate-900">Check a landlord</a>
        <a href="/guides/" class="hover:text-slate-900">Guides</a>
      </nav>
      <a href="/#list" class="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 sm:px-4"><i class="fa-solid fa-plus"></i><span class="sm:hidden">List</span><span class="hidden sm:inline">List a property</span></a>
    </div>
  </header>
  <main class="mx-auto max-w-6xl px-4 py-8">${body}</main>
  <footer class="mt-8 bg-ink text-slate-400">
    <div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div>
        <a href="/" class="flex items-center gap-2.5">
          <span class="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white"><i class="fa-solid fa-house-circle-check text-[15px]"></i></span>
          <span class="text-lg font-extrabold tracking-tight text-white">TrueHome<span class="font-semibold text-emerald-400"> Kenya</span></span>
        </a>
        <p class="mt-4 max-w-xs text-sm leading-relaxed">Homes for rent and sale across Kenya, listed directly by landlords and agents whose ID and ownership we check.</p>
        <p class="mt-4 text-sm"><i class="fa-regular fa-envelope mr-2 text-emerald-400"></i><a href="mailto:support@truehomekenya.com" class="hover:text-white">support@truehomekenya.com</a></p>
      </div>
      <div>
        <p class="text-sm font-bold text-white">For tenants and buyers</p>
        <ul class="mt-3 grid gap-2 text-sm">
          <li><a href="/#browse" class="hover:text-white">Browse homes</a></li>
          <li><a href="/rent/" class="hover:text-white">Homes to rent</a></li>
          <li><a href="/buy/" class="hover:text-white">Homes and land for sale</a></li>
          <li><a href="/#phone" class="hover:text-white">Check a landlord</a></li>
        </ul>
      </div>
      <div>
        <p class="text-sm font-bold text-white">For landlords and agents</p>
        <ul class="mt-3 grid gap-2 text-sm">
          <li><a href="/#list" class="hover:text-white">List a property</a></li>
          <li><a href="/#verify" class="hover:text-white">Get verified</a></li>
          <li><a href="/guides/how-to-list-your-property/" class="hover:text-white">How to list</a></li>
        </ul>
      </div>
      <div>
        <p class="text-sm font-bold text-white">TrueHome Kenya</p>
        <ul class="mt-3 grid gap-2 text-sm">
          <li><a href="/guides/" class="hover:text-white">Guides</a></li>
          <li><a href="/#terms" class="hover:text-white">Terms of Use</a></li>
          <li><a href="/#privacy" class="hover:text-white">Privacy Policy</a></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-white/10">
      <p class="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-500">© ${new Date().getFullYear()} TrueHome Kenya. Always view a property and confirm ownership before paying anything.</p>
    </div>
  </footer>
</body>
</html>
`;
}

function cardHTML(l) {
  const ph = photosOf(l)[0];
  const meta = l.type === 'land' || l.type === 'commercial' ? typeLabel(l) : `${l.beds > 0 ? l.beds + ' bd' : 'Studio'} · ${l.baths} ba · ${typeLabel(l)}`;
  return `<a href="${listingPath(l)}" class="block overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:shadow-lg">
      <div class="relative h-44 bg-gradient-to-br from-emerald-500 to-teal-700">
        ${ph ? `<img src="${esc(ph)}" alt="${esc(l.title)}" loading="lazy" class="h-full w-full object-cover">` : `<div class="grid h-full place-items-center text-4xl text-white/80"><i class="fa-solid ${(TYPES[l.type] || {}).icon || 'fa-house'}"></i></div>`}
        ${l.owner_verified ? '<span class="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white"><i class="fa-solid fa-circle-check"></i> Verified</span>' : ''}
      </div>
      <div class="p-3">
        <p class="text-lg font-extrabold">${esc(priceText(l))}</p>
        <p class="text-sm text-slate-600">${esc(meta)}</p>
        <h3 class="mt-1 truncate font-medium">${esc(l.title)}</h3>
        <p class="truncate text-sm text-slate-500"><i class="fa-solid fa-location-dot"></i> ${esc(l.location)}, ${esc(l.county)}</p>
      </div>
    </a>`;
}

function listingPage(l, similar) {
  const ps = photosOf(l);
  const appLink = `/#l/${encodeURIComponent(l.id)}`;
  const desc = `${typeLabel(l)} ${l.purpose === 'rent' ? 'for rent' : 'for sale'} in ${l.location}, ${l.county}: ${priceText(l)}. ${l.landmarks ? l.landmarks + '. ' : ''}${l.type === 'land' || l.type === 'commercial' ? '' : (l.beds > 0 ? l.beds + ' bedroom' : 'Studio') + ', ' + l.baths + ' bathroom. '}${l.owner_verified ? 'Verified lister. ' : ''}Contact the ${l.role || 'lister'} directly on WhatsApp.`;
  const features = FEATURE_GROUPS.map((g) => ({ ...g, items: g.items.filter(([k]) => (l.features || []).includes(k)) })).filter((g) => g.items.length);
  const isLand = l.type === 'land' || l.type === 'commercial';
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: l.title,
    url: SITE + listingPath(l),
    datePosted: l.created_at,
    description: l.description || desc,
    image: ps.slice(0, 6),
    offers: { '@type': 'Offer', price: l.price, priceCurrency: 'KES', businessFunction: l.purpose === 'rent' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell' },
    about: {
      '@type': isLand ? 'Place' : l.type === 'house' ? 'SingleFamilyResidence' : 'Apartment',
      address: { '@type': 'PostalAddress', addressLocality: l.location, addressRegion: l.county + ' County', addressCountry: 'KE' },
      geo: { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng },
      ...(isLand ? {} : { numberOfBedrooms: l.beds, numberOfBathroomsTotal: l.baths })
    }
  };
  const body = `
    <nav class="mb-4 text-sm text-slate-500"><a href="/" class="hover:underline">Home</a> › <a href="/${purposePath(l.purpose)}/" class="hover:underline">${l.purpose === 'rent' ? 'To rent' : 'For sale'}</a> › <a href="/${purposePath(l.purpose)}/${slug(l.location)}/" class="hover:underline">${esc(l.location)}</a></nav>
    ${ps.length ? `<div class="grid gap-2 overflow-hidden rounded-2xl ${ps.length > 1 ? 'sm:grid-cols-3' : ''}">
        <img src="${esc(ps[0])}" alt="${esc(l.title)}" class="h-72 w-full object-cover sm:h-96 ${ps.length > 1 ? 'sm:col-span-2' : ''}">
        ${ps.length > 1 ? `<div class="hidden grid-rows-2 gap-2 sm:grid">${ps.slice(1, 3).map((u, i) => `<img src="${esc(u)}" alt="${esc(l.title)}, photo ${i + 2}" loading="lazy" class="h-full w-full object-cover">`).join('')}</div>` : ''}
      </div>` : ''}
    <div class="mt-6 grid gap-8 lg:grid-cols-3">
      <article class="lg:col-span-2">
        <p class="text-sm font-semibold uppercase tracking-wide text-emerald-700">${l.purpose === 'rent' ? 'For rent' : 'For sale'}${l.owner_verified ? ' · <i class="fa-solid fa-circle-check"></i> Verified lister' : ''}</p>
        <p class="mt-1 text-3xl font-extrabold">${esc(priceText(l))}</p>
        <h1 class="mt-1 text-2xl font-bold">${esc(l.title)}</h1>
        <p class="mt-1 text-slate-600"><i class="fa-solid fa-location-dot text-emerald-600"></i> ${esc(l.location)}, ${esc(l.county)} County</p>
        ${l.landmarks ? `<p class="mt-1 text-sm text-slate-500"><i class="fa-solid fa-signs-post"></i> ${esc(l.landmarks)}</p>` : ''}
        <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${l.lat},${l.lng}" rel="noopener" target="_blank" class="mt-1 inline-block text-sm font-semibold text-emerald-700 underline">Get directions</a>
        <ul class="mt-5 flex flex-wrap gap-3 text-sm">
          ${isLand ? '' : `<li class="rounded-lg border border-slate-200 bg-white px-3 py-2"><strong>${l.beds > 0 ? l.beds : 'Studio'}</strong> bedrooms</li><li class="rounded-lg border border-slate-200 bg-white px-3 py-2"><strong>${l.baths}</strong> bathrooms</li>`}
          <li class="rounded-lg border border-slate-200 bg-white px-3 py-2"><strong>${esc(typeLabel(l))}</strong></li>
        </ul>
        ${l.description ? `<h2 class="mt-8 text-xl font-bold">About this property</h2><p class="mt-2 whitespace-pre-line leading-relaxed text-slate-700">${esc(l.description)}</p>` : ''}
        ${features.length ? `<h2 class="mt-8 text-xl font-bold">Features</h2>${features.map((g) => `<p class="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">${esc(g.name)}</p><p class="mt-1 flex flex-wrap gap-1.5">${g.items.map(([, label]) => `<span class="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm text-emerald-800">${esc(label)}</span>`).join('')}</p>`).join('')}` : ''}
        <p class="mt-8 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><strong>Stay safe:</strong> never pay a deposit or viewing fee before visiting the property and confirming who owns it. Read <a class="underline" href="/guides/how-to-avoid-rental-scams-in-kenya/">how to avoid rental scams</a>.</p>
      </article>
      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p class="text-2xl font-extrabold">${esc(priceText(l))}</p>
          <p class="mt-2 text-sm text-slate-600">Listed by <strong>${esc(l.contact_name)}</strong> (${esc(l.role || 'lister')})${l.owner_verified ? ' · <span class="font-semibold text-emerald-700">Verified</span>' : ''}</p>
          <a href="${appLink}" class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 font-semibold text-white hover:brightness-95"><i class="fa-brands fa-whatsapp text-lg"></i> Contact on WhatsApp</a>
          <a href="${appLink}" class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50"><i class="fa-solid fa-images"></i> All photos, map & details</a>
          ${l.owner_code ? `<a href="/#v/${encodeURIComponent(l.owner_code)}" class="mt-2 block text-center text-sm font-semibold text-emerald-700 underline">Check badge ${esc(l.owner_code)}</a>` : ''}
        </div>
      </aside>
    </div>
    ${similar.length ? `<h2 class="mt-12 text-xl font-bold">More ${l.purpose === 'rent' ? 'homes to rent' : 'property for sale'} in ${esc(l.county)}</h2><div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${similar.map(cardHTML).join('')}</div>` : ''}`;
  return page({
    title: `${l.title} – ${priceText(l)} in ${l.location} | TrueHome Kenya`,
    description: desc.slice(0, 300),
    canonical: listingPath(l),
    image: ps[0],
    jsonld,
    body
  });
}

function listPage({ canonical, title, h1, intro, items, crumbs, links }) {
  const body = `
    <nav class="mb-4 text-sm text-slate-500">${crumbs}</nav>
    <h1 class="text-3xl font-extrabold sm:text-4xl">${esc(h1)}</h1>
    <p class="mt-2 max-w-3xl text-slate-600">${intro}</p>
    ${links ? `<div class="mt-4 flex flex-wrap gap-2">${links}</div>` : ''}
    <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">${items.map(cardHTML).join('')}</div>
    <p class="mt-10 rounded-xl bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">Looking for something specific? <a href="/#browse" class="font-semibold text-emerald-700 underline">Search all homes on the map</a> and filter by price, bedrooms and features like borehole, token meter or gated compound. Landlords and agents: <a href="/#list" class="font-semibold text-emerald-700 underline">list your property free</a>.</p>`;
  return page({ title, description: intro.replace(/<[^>]+>/g, '').slice(0, 300), canonical, body, jsonld: {
    '@context': 'https://schema.org', '@type': 'ItemList', name: h1,
    itemListElement: items.slice(0, 50).map((l, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + listingPath(l) }))
  } });
}

function guidePage(g) {
  const others = GUIDES.filter((x) => x.slug !== g.slug);
  const body = `
    <nav class="mb-4 text-sm text-slate-500"><a href="/" class="hover:underline">Home</a> › <a href="/guides/" class="hover:underline">Guides</a></nav>
    <div class="grid gap-10 lg:grid-cols-3">
      <article class="prose rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-10 lg:col-span-2">
        <h1 class="text-3xl font-extrabold leading-tight sm:text-4xl">${esc(g.h1)}</h1>
        <p class="mt-2 text-sm text-slate-500">TrueHome Kenya · Updated ${new Date(g.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
        ${g.body}
      </article>
      <aside class="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div class="rounded-2xl bg-emerald-700 p-5 text-white">
          <p class="text-lg font-bold">Find a verified home</p>
          <p class="mt-1 text-sm text-emerald-100">Rent or buy directly from landlords whose ID and ownership we've checked.</p>
          <a href="/#browse" class="mt-3 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-emerald-800">Browse homes</a>
        </div>
        <div class="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <p class="font-bold">More guides</p>
          <ul class="mt-2 space-y-2 text-sm">${others.map((o) => `<li><a href="/guides/${o.slug}/" class="text-emerald-700 underline">${esc(o.h1)}</a></li>`).join('')}</ul>
        </div>
      </aside>
    </div>`;
  return page({
    title: `${g.title} | TrueHome Kenya`, description: g.description, canonical: `/guides/${g.slug}/`, body,
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: g.h1, description: g.description, dateModified: g.updated, author: { '@type': 'Organization', name: 'TrueHome Kenya', url: SITE }, publisher: { '@type': 'Organization', name: 'TrueHome Kenya' }, mainEntityOfPage: SITE + `/guides/${g.slug}/` }
  });
}

function guidesIndex() {
  const body = `
    <h1 class="text-3xl font-extrabold sm:text-4xl">Guides for renting and buying safely in Kenya</h1>
    <p class="mt-2 max-w-2xl text-slate-600">Practical, plain-language guides to avoiding scams, checking landlords and agents, and doing your homework before you pay.</p>
    <div class="mt-8 grid gap-4 sm:grid-cols-2">${GUIDES.map((g) => `
      <a href="/guides/${g.slug}/" class="block rounded-2xl bg-white p-6 ring-1 ring-slate-200 transition hover:shadow-lg">
        <p class="text-lg font-bold">${esc(g.h1)}</p>
        <p class="mt-1 text-sm text-slate-600">${esc(g.description)}</p>
        <p class="mt-3 text-sm font-semibold text-emerald-700">Read the guide →</p>
      </a>`).join('')}</div>`;
  return page({ title: 'Guides: Renting and Buying Safely in Kenya | TrueHome Kenya', description: 'Guides to avoiding rental scams, doing a land search, checking estate agents and buying property in Kenya safely.', canonical: '/guides/', body });
}

// ---- Load listings ----
async function loadListings() {
  if (OFFLINE) return null;
  let rows;
  if (process.env.SEO_FIXTURE) {
    rows = JSON.parse(fs.readFileSync(process.env.SEO_FIXTURE, 'utf8'));
  } else {
    const cfg = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
    const url = (cfg.match(/supabaseUrl:\s*'([^']+)'/) || [])[1];
    const key = (cfg.match(/supabaseAnonKey:\s*'([^']+)'/) || [])[1];
    if (!url || !key) throw new Error('config.js has no Supabase details');
    const res = await fetch(`${url}/rest/v1/listings_public?select=*&order=created_at.desc&limit=5000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error('Supabase answered ' + res.status + ': ' + (await res.text()).slice(0, 200));
    rows = await res.json();
  }
  const now = Date.now();
  return rows.filter((l) => !l.expires_at || Date.parse(l.expires_at) > now);
}

const listings = await loadListings();
const urls = [{ loc: '/', freq: 'daily', pri: '1.0' }, { loc: '/guides/', freq: 'weekly', pri: '0.7' }];

// Guides (always)
fs.rmSync(path.join(ROOT, 'guides'), { recursive: true, force: true });
write('guides/index.html', guidesIndex());
for (const g of GUIDES) {
  write(`guides/${g.slug}/index.html`, guidePage(g));
  urls.push({ loc: `/guides/${g.slug}/`, freq: 'monthly', pri: '0.7', lastmod: g.updated });
}

if (listings) {
  for (const dir of ['homes', 'rent', 'buy']) fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });

  for (const l of listings) {
    const similar = listings.filter((x) => x.id !== l.id && x.purpose === l.purpose && x.county === l.county).slice(0, 4);
    write(`${listingPath(l).slice(1)}index.html`, listingPage(l, similar));
    urls.push({ loc: listingPath(l), freq: 'weekly', pri: '0.8', lastmod: (l.updated_at || l.created_at || '').slice(0, 10) });
  }

  for (const purpose of ['rent', 'sale']) {
    const pp = purposePath(purpose);
    const words = purpose === 'rent' ? 'to rent' : 'for sale';
    const mine = listings.filter((l) => l.purpose === purpose);
    if (!mine.length) {
      write(`${pp}/index.html`, page({
        title: `Property ${words} in Kenya | TrueHome Kenya`,
        description: `Houses, apartments and land ${words} in Kenya, listed directly by verified landlords and agents.`,
        canonical: `/${pp}/`,
        body: `<h1 class="text-3xl font-extrabold">Property ${words} in Kenya</h1>
          <div class="mt-6 rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
            <p class="text-lg font-semibold">New listings are coming soon.</p>
            <p class="mt-1 text-slate-600">Landlords and agents are joining TrueHome Kenya now.</p>
            <div class="mt-4 flex flex-wrap justify-center gap-3"><a href="/#browse" class="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-emerald-800">Browse homes</a><a href="/#list" class="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold shadow-sm">List your property free</a></div>
          </div>`
      }));
      continue;
    }
    const areaNames = [...new Set(mine.map((l) => l.location))].sort();
    const typeKeys = [...new Set(mine.map((l) => l.type))];
    const areaLinks = areaNames.map((a) => `<a href="/${pp}/${slug(a)}/" class="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-slate-200 hover:bg-slate-100">${esc(a)}</a>`).join('');
    const typeLinks = typeKeys.map((t) => `<a href="/${pp}/${TYPE_SLUG[t]}/" class="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-slate-200 hover:bg-slate-100">${esc(TYPE_PLURAL[t])}</a>`).join('');
    write(`${pp}/index.html`, listPage({
      canonical: `/${pp}/`,
      title: `Property ${words} in Kenya (${mine.length} listings) | TrueHome Kenya`,
      h1: `Houses, apartments and land ${words} in Kenya`,
      intro: `${mine.length} listing${mine.length === 1 ? '' : 's'} ${words} directly from landlords and agents. Look for the <strong>Verified</strong> badge: we've checked those listers' ID and ownership documents.`,
      items: mine, crumbs: `<a href="/" class="hover:underline">Home</a> › ${purpose === 'rent' ? 'To rent' : 'For sale'}`, links: typeLinks + areaLinks
    }));
    urls.push({ loc: `/${pp}/`, freq: 'daily', pri: '0.9' });

    for (const a of areaNames) {
      const items = mine.filter((l) => l.location === a);
      const county = items[0].county;
      write(`${pp}/${slug(a)}/index.html`, listPage({
        canonical: `/${pp}/${slug(a)}/`,
        title: `Houses & apartments ${words} in ${a} (${items.length}) | TrueHome Kenya`,
        h1: `Property ${words} in ${a}, ${county}`,
        intro: `${items.length} home${items.length === 1 ? '' : 's'} ${words} in ${esc(a)}, ${esc(county)} County, listed directly by landlords and agents. Prices, photos and features; contact listers on WhatsApp.`,
        items, crumbs: `<a href="/" class="hover:underline">Home</a> › <a href="/${pp}/" class="hover:underline">${purpose === 'rent' ? 'To rent' : 'For sale'}</a> › ${esc(a)}`, links: typeLinks
      }));
      urls.push({ loc: `/${pp}/${slug(a)}/`, freq: 'daily', pri: '0.8' });
    }
    for (const t of typeKeys) {
      const items = mine.filter((l) => l.type === t);
      write(`${pp}/${TYPE_SLUG[t]}/index.html`, listPage({
        canonical: `/${pp}/${TYPE_SLUG[t]}/`,
        title: `${TYPE_PLURAL[t]} ${words} in Kenya (${items.length}) | TrueHome Kenya`,
        h1: `${TYPE_PLURAL[t]} ${words} in Kenya`,
        intro: `${items.length} ${TYPE_PLURAL[t].toLowerCase()} ${words}, listed directly by landlords and agents across Kenya.`,
        items, crumbs: `<a href="/" class="hover:underline">Home</a> › <a href="/${pp}/" class="hover:underline">${purpose === 'rent' ? 'To rent' : 'For sale'}</a> › ${esc(TYPE_PLURAL[t])}`, links: areaLinks
      }));
      urls.push({ loc: `/${pp}/${TYPE_SLUG[t]}/`, freq: 'daily', pri: '0.8' });
    }
  }
} else {
  // Offline: keep whatever listing pages already exist in the sitemap
  for (const [pp, words] of [['rent', 'to rent'], ['buy', 'for sale']]) {
    if (!fs.existsSync(path.join(ROOT, pp, 'index.html'))) write(`${pp}/index.html`, page({
      title: `Property ${words} in Kenya | TrueHome Kenya`, description: `Houses, apartments and land ${words} in Kenya.`, canonical: `/${pp}/`,
      body: `<h1 class="text-3xl font-extrabold">Property ${words} in Kenya</h1><p class="mt-4"><a class="font-semibold text-emerald-700 underline" href="/#browse">Browse homes</a></p>`
    }));
  }
  for (const dir of ['homes', 'rent', 'buy']) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name === 'index.html') urls.push({ loc: '/' + path.relative(ROOT, d).split(path.sep).join('/') + (d === ROOT ? '' : '/'), freq: 'daily', pri: '0.8' });
    });
    walk(base);
  }
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);

console.log(`Built ${GUIDES.length} guides${listings ? `, ${listings.length} listing pages` : ' (offline: listings skipped)'}; sitemap has ${urls.length} URLs.`);
