# TrueHome Kenya

A Zillow-inspired real estate web portal built for the Kenyan housing market. TrueHome Kenya lets landlords and agents list properties directly, connects buyers and tenants with them instantly over WhatsApp, and demonstrates a document-based verification flow for landlords.

> **Status:** Prototype / demo. All listings and uploads are stored in your own browser (LocalStorage). No data is sent to a server, and verification is simulated.

**Live demo:** https://wamkam80.github.io/makaokenya

## Features
- **Direct listing by landlords and agents:** Property owners create, edit and remove their own listings without a middleman.
- **Verified landlord badge (demo):** Landlords upload a National ID and Title Deed to request a "Verified" badge. In this prototype the review step is simulated.
- **Interactive map and search:** Filter listings by location, price, bedrooms and property type, and explore them on a map of Nairobi and other major towns.
- **Direct contact:** One-tap WhatsApp and phone buttons connect buyers and tenants straight to landlords and caretakers.

## Tech Stack
- HTML5, CSS3 and Tailwind CSS (via CDN)
- Leaflet.js with OpenStreetMap tiles
- Font Awesome icons
- LocalStorage for data (no backend, so it runs on GitHub Pages)

## Getting Started
1. Clone the repository:
   ```bash
   git clone https://github.com/wamkam80/makaokenya.git
   ```
2. Open `index.html` in your browser. No build step or install is needed.

## Deployment
1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**, choose the `main` branch and the root folder, then save.
3. The site will be live at `https://wamkam80.github.io/makaokenya`.

## Limitations
- Data lives only in the browser that created it. Other visitors cannot see your listings, and clearing browser data deletes them.
- LocalStorage holds about 5 MB, so only a few photos or documents fit.
- Verification is not real. Anyone can mark a listing as verified, so the badge should not be trusted in this version.

## Privacy
Do not upload real National IDs or Title Deeds to this demo. A production version must store identity documents securely on a server, restrict who can view them, and comply with Kenya's Data Protection Act, 2019.

## Roadmap
- [ ] Backend and database (e.g. Supabase or Firebase) so listings are shared across all users
- [ ] Secure document storage and an admin review panel for verification
- [ ] User accounts for landlords, agents and tenants
- [ ] M-Pesa payments for featured listings
- [ ] Saved searches and listing alerts
