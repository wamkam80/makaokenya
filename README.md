# TrueHome Kenya

A Zillow-inspired real estate web portal built for the Kenyan housing market. TrueHome Kenya lets landlords and agents list properties directly, connects buyers and tenants with them instantly over WhatsApp, and verifies listers by checking their ID and proof of ownership.

**Live site:** https://truehomekenya.com

## Two modes
- **Demo mode** (default, while `config.js` is empty): sample listings, with data saved only in your own browser. Verification is simulated.
- **Live mode** (once Supabase is connected): shared listings, email sign-in, online photo storage, private document uploads, and admin-only approval of the Verified badge.

👉 **To go live, follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md).**

## Features
- **Direct listing by landlords and agents:** owners create, edit and remove their own listings without a middleman.
- **Verified badge:** listers upload their National ID and Title Deed (or a management agreement). An admin checks them against Ardhisasa and the EARB register before approving. Nobody can give themselves the badge.
- **Interactive map and search:** filter by rent/sale, type, county, bedrooms, price and verified-only, and explore listings on a map.
- **Badge you can check:** every verified lister gets a code like `TH-7KQ2MX`, a QR code and a public page (`?v=TH-7KQ2MX`) with a live clock. Tenants scan or type the code under **Check a badge**, so copied badge images don't work.
- **Admin page:** approve or reject verification requests, view private documents, and handle reports with one tap at `#admin` (admins only, enforced by the database).
- **Ban scammers:** one tap hides all their listings, removes their badge and blocks their phone numbers.
- **Visitor numbers:** cookie-free Cloudflare Web Analytics, plus a view count on every listing.
- **Share buttons:** landlords share listings and badges straight to WhatsApp and Facebook, with links that open the exact listing or badge check.
- **Direct contact:** one-tap WhatsApp and phone buttons with correctly formatted Kenyan numbers (`wa.me/2547…`).
- **Safety:** HTML in listings is escaped, phone numbers are validated, and the database enforces that users can only change their own data.

## Files
| File | What it is |
|---|---|
| `index.html` | The whole website |
| `config.js` | Supabase connection settings (empty = demo mode) |
| `supabase/schema.sql` | Database tables, file storage and security rules |
| `SUPABASE_SETUP.md` | Step-by-step setup and how to approve verifications |
| `list.html` | Redirects old links to the listing form |

## Tech Stack
- HTML5 and Tailwind CSS (via CDN)
- Leaflet.js with OpenStreetMap tiles
- Font Awesome icons
- Supabase (Postgres database, authentication and file storage), with LocalStorage in demo mode
- Hosted on GitHub Pages; no build step

## Running locally
```bash
git clone https://github.com/wamkam80/makaokenya.git
cd makaokenya
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Privacy
Live mode stores National ID numbers and documents. They are kept in a private storage bucket that only the admin can open. Before a public launch, register with Kenya's Office of the Data Protection Commissioner and publish a privacy policy. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md#before-a-public-launch).

## Roadmap
- [x] Shared database for listings (Supabase)
- [x] Secure document storage and admin approval of verification
- [x] Sign-in for landlords and agents
- [ ] Automatic ID checks against IPRS (e.g. Smile ID)
- [x] Public verification page and QR code for each verified lister
- [x] "Report this listing" button
- [ ] M-Pesa payments for featured listings
- [ ] Saved searches and listing alerts
