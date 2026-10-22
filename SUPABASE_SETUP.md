# Going live with Supabase

Until you finish these steps, the site runs in **demo mode**: sample listings, with everything saved only in each visitor's own browser.

Once connected to Supabase:
- Listings are shared with everyone, and photos are stored online.
- Landlords and agents sign in with an emailed link (no password).
- Verification documents are stored **privately**. Only you can open them.
- **Only you** can give someone the Verified badge. Nobody can grant it to themselves.

Allow about 20 minutes. Everything here is free to start.

---

## 1. Create a Supabase project

1. Go to https://supabase.com and sign up (signing in with GitHub is easiest).
2. Click **New project**.
   - **Name:** `truehome-kenya`
   - **Database password:** click *Generate* and save it somewhere safe.
   - **Region:** choose the one closest to Kenya that's offered (for example Europe).
3. Wait a minute or two while the project is created.

## 2. Create the database

1. In your project, open **SQL Editor** in the left menu, then click **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo and copy **all** of it.
3. Paste it into the editor and click **Run**. You should see *Success. No rows returned*.

This creates the tables, the file storage folders and all the security rules. It's safe to run again later.

## 3. Allow sign-in links to return to your site

Go to **Authentication → URL Configuration**:
- **Site URL:** `https://wamkam80.github.io/makaokenya/`
- Under **Redirect URLs**, click *Add URL* and add `https://wamkam80.github.io/makaokenya/**`

Click **Save**.

## 4. Connect the website

1. Go to **Project Settings → API** (on some accounts it's called **API Keys**).
2. Copy two values:
   - **Project URL**, which looks like `https://abcdefghijklm.supabase.co`
   - The **anon public** key (or the **publishable** key, which starts with `sb_publishable_`)
3. In GitHub, open [`config.js`](config.js), tap the ✏️ pencil icon, and paste the two values in:

   ```js
   window.TRUEHOME_CONFIG = {
     supabaseUrl: 'https://abcdefghijklm.supabase.co',
     supabaseAnonKey: 'paste-your-anon-or-publishable-key-here'
   };
   ```
4. Click **Commit changes**. After about a minute, the site switches to live mode.

> ⚠️ **Never** paste the `service_role` or `secret` key into `config.js`. That key bypasses every security rule. The anon/publishable key is designed to be public.

## 5. Test it

1. Open https://wamkam80.github.io/makaokenya and tap **List a property**.
2. Enter your email and open the sign-in link you receive **on the same phone or computer**.
3. Publish a test listing, then submit a verification request.

---

## Reviewing verification requests (your job as admin)

### See who is waiting
**Table Editor → `verification_requests`**. Rows with `status = pending` are waiting. Copy the request's `id` and `user_id`.

### Check their documents
**Storage → `verification-docs`** → open the folder named after their `user_id`. You'll find their ID and ownership document there.

### What to check before approving
- **Everyone:** the ID photo is clear, the name matches `full_name`, and the ID number matches.
- **Landlords:** run an official search on **Ardhisasa** (or at the land registry) using the title/LR number. The registered owner must match their ID.
- **Agents:** confirm their `agent_reg_no` appears on the **Estate Agents Registration Board** register.
- **Caretakers / agents acting for an owner:** the management letter must be signed by the verified owner.
- **Recommended:** a quick WhatsApp video call to confirm they're the person on the ID.

### Approve or reject
Go to **SQL Editor → New query**, paste one of these with the real id, and click **Run**:

```sql
-- Approve: gives the Verified badge to all their listings
select public.approve_verification('PASTE-REQUEST-ID-HERE');

-- Reject: the user sees your reason and can submit again
select public.reject_verification('PASTE-REQUEST-ID-HERE', 'The ID photo is blurry. Please upload a clearer photo.');

-- Remove a badge later (e.g. after scam reports)
select public.revoke_verification('PASTE-USER-ID-HERE');
```

Website visitors cannot run these functions; only you can, from the dashboard.

When you approve someone, they automatically get a **badge code** (like `TH-7KQ2MX`), a QR code and a public check page. They'll find these under **My listings** and can download a printable badge. Tenants check codes under **Check a badge**. If you revoke someone, their page immediately shows **BADGE WITHDRAWN**.

---

## Reviewing reported listings

Tenants can tap **Report this listing** on any listing. Reports are private, and only you can see them.

1. Open **Table Editor → `open_reports`** to see every open report, with the listing title, phone number, whether the owner is verified, and how many reports that listing has in total.
2. To remove a listing: **Table Editor → `listings`**, find the row by `listing_id`, and delete it.
3. If the owner is verified and the report is serious, also withdraw their badge (see above): `select public.revoke_verification('OWNER-ID');`
4. Mark the report as handled: **Table Editor → `listing_reports`**, set `status` to `reviewed` (nothing needed) or `actioned` (you removed something).

Or just ask Claude: "show me open reports" or "remove listing X and revoke the owner".

---

## Before a public launch

- **Email sending:** Supabase's built-in email only sends a few sign-in emails per hour, which is fine for testing but not for real users. Set up your own email service under **Authentication → Emails → SMTP Settings** (Brevo and Resend both have free plans).
- **Data protection:** you'll be storing ID numbers and ID documents. Register with Kenya's **Office of the Data Protection Commissioner (ODPC)**, publish a privacy policy, and delete documents you no longer need.
- **Backups:** the free plan pauses projects that are inactive for a while. Upgrade before you depend on it.
