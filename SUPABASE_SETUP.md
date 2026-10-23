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
- **Site URL:** `https://truehomekenya.com/`
- Under **Redirect URLs**, click *Add URL* and add `https://truehomekenya.com/**`

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

1. Open https://truehomekenya.com and tap **List a property**.
2. Enter your email and open the sign-in link you receive **on the same phone or computer**.
3. Publish a test listing, then submit a verification request.

---

## Your Admin page

Sign in on the site with your admin email. An **Admin** link appears in the menu (or go straight to https://truehomekenya.com/#admin). Nobody else sees it, and the database refuses admin actions from anyone who isn't on the `admins` list.

### Verification requests tab
Each waiting request shows the person's name, role, ID number and title/LR or agent number.
1. Tap **View ID** and **View ownership doc**. The documents open through a private link that expires after 5 minutes.
2. Check them:
   - **Everyone:** the ID photo is clear, and the name and ID number match.
   - **Landlords:** tap **Search on Ardhisasa** and confirm the registered owner matches their ID.
   - **Agents:** tap **EARB register** and confirm their registration number is listed.
   - **Caretakers / agents acting for an owner:** the management letter must be signed by the owner.
   - **Recommended:** a quick WhatsApp video call to confirm they're the person on the ID.
3. Tap **Approve** to give them the badge (they get a code like `TH-7KQ2MX`, a QR code and a check page), or type a reason and tap **Reject**. They'll see your reason and can try again.

### Reports tab
Every open report, with the reason, the listing, its phone number and how many reports it has. One tap each:
- **Nothing wrong**: closes the report.
- **Remove listing**: deletes the listing and its photos.
- **Withdraw owner's badge**: their badge page immediately shows **BADGE WITHDRAWN**.

### Verified tab
Everyone with a badge. **Withdraw badge** removes it at any time.

### Banning a scammer
Every request, report and verified lister has a **Ban user** button. Type a reason and tap **Confirm ban**. Then:
- all their listings disappear from the site, and any badge is withdrawn;
- they can't post, edit, upload or ask for verification, and see a "suspended" notice under **My listings**;
- the phone numbers they used are blocked, so nobody can post new listings with them.

The **Banned** tab lists everyone banned. **Lift ban** undoes it.

---

## Automatic jobs (twice a week)

A small GitHub job (`.github/workflows/keep-awake.yml`) runs every Monday and Thursday. You can see it, or run it by hand, under the repo's **Actions** tab. It:
- visits the database, because Supabase's free plan pauses a project after about a week with no activity;
- calls the `cleanup-docs` Edge Function (`supabase/functions/cleanup-docs`), which deletes the ID and ownership documents of verification requests rejected more than 83 days ago, as the privacy policy promises.

## Listing expiry

Rentals stay live for 60 days and sales for 90 days. After that they're hidden from search until the lister taps **Still available** (or edits the listing) under **My listings**. This keeps let or sold homes off the site.

## Visitor numbers

- **Site visits:** Cloudflare dashboard → **Analytics → Web analytics** → truehomekenya.com. No cookies, nothing personal.
- **Listing views:** each lister sees "N views" under **My listings**. A visitor is counted once per listing per day.

### Adding another admin
In **SQL Editor**, run: `insert into public.admins (user_id) select id from auth.users where email = 'their@email.com';` (they must have signed in once first).

---

## Sharing

Every listing has a **Share** button (on the listing and under **My listings**), with WhatsApp, Facebook and Copy link. The badge card has the same buttons. Shared links look like `truehomekenya.com/?l=…` for a listing and `truehomekenya.com/?v=TH-XXXXXX` for a badge, and open straight to that listing or badge check.

---

## Before a public launch

- **Email sending:** Supabase's built-in email only sends a few sign-in emails per hour, which is fine for testing but not for real users. Set up your own email service under **Authentication → Emails → SMTP Settings** (Brevo and Resend both have free plans).
- **Data protection:** you'll be storing ID numbers and ID documents. Register with Kenya's **Office of the Data Protection Commissioner (ODPC)**, publish a privacy policy, and delete documents you no longer need.
- **Backups:** the free plan pauses projects that are inactive for a while. Upgrade before you depend on it.
