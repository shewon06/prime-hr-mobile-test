# PRIME HR NEXT LEVEL — Cloudflare Pages Deployment

## Ready GitHub source
GitHub repository: https://github.com/shewon06/prime-hr-mobile-test
Production branch: `main`

## First-time setup (requires account owner to sign in and authorize GitHub)
1. Visit https://dash.cloudflare.com/ and open **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Choose GitHub. Authorize the Cloudflare GitHub app to access **only** `shewon06/prime-hr-mobile-test` (no need to grant all repositories).
3. Choose repository `shewon06/prime-hr-mobile-test`, branch `main`.
4. Project name: `prime-hr-next-level` (if available; Cloudflare issues the actual URL).
5. Select **Framework preset: None**.
6. Set **Build command:** `node build-cloudflare.mjs`
7. Set **Build output directory:** `dist`
8. **Root directory:** repository root (`/` or leave empty).
9. Save and **Deploy**.

No environment variables are needed in Cloudflare for the current frontend. The public Supabase URL and **publishable** key are already in `config.js`; NEVER place a Supabase secret/service-role key in Cloudflare Pages.

## Resulting pages
- Admin web portal: `https://<ACTUAL_CLOUDFLARE_PROJECT>.pages.dev/`
- Employee mobile app: `https://<ACTUAL_CLOUDFLARE_PROJECT>.pages.dev/employee.html`

The actual `.pages.dev` URL is assigned by Cloudflare **only after deployment**, so don't guess it beforehand.

## Supabase authentication redirect
After the production URL is known:
- Open https://supabase.com/dashboard/project/qkhcojaouueypkgrzlov/auth/url-configuration
- Change **Site URL** from the development `http://localhost:3000` to the EXACT Cloudflare production URL ending with `/`.
- Add the exact production URL to **Redirect URLs**. Additional explicit employee-path URL may be added if needed.
- Password-based employee sign-in does not require email confirmation redirects: Admin issues confirmed, internally generated staff identities, and staff log in using Employee Number.
- Do not put `https://*.pages.dev/**` into the general auth allowlist — it permits unrelated Pages tenants.

## Netlify cost
Do not disable the old Netlify site before verifying that the new Cloudflare site works. Once confirmed:
- In Netlify, disable automatic Git deployments / unlink the old HR project, or retire the old site to avoid future credit usage.
- This procedure does NOT touch the existing WON MART website or the `wonsolutions.me` apex.

## Custom company domain (optional)
After validating Cloudflare Pages, add `hr.primeagriplantation.lk` through Pages → **Custom domains**, and set DNS only with the domain owner's authorization. Do not modify other company DNS records.

## Release safety
Cloudflare build runs `node build-cloudflare.mjs` and copies only the 10 explicitly permitted static assets to `dist`. This excludes service-role function source, migrations, SQL, documents and any untracked personnel data. Backend continues to be Supabase.

Actual end-to-end user login, Excel provisioning, privacy notice, GPS permissions, staff access and Netlify migration must be validated before real HR data is entered.

## Cost notes
Cloudflare Pages Free has limits (including the current build limit); static file serving is free/unlimited without Pages Functions. Supabase has separate usage quotas.
