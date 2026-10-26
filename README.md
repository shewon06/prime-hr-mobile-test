# PRIME HR NEXT LEVEL — Mobile Install Test

**Mobile PWA prototype only** — no company authentication, Supabase connection, real employee data, or payroll. The sample check-in, leave and notices are stored locally on your phone.

## Publish without changing WON MART

The account's user-site custom domain is `wonsolutions.me`, which currently routes to the unrelated WON MART site. Because GitHub Pages can inherit this domain for other repositories, **use a separate Netlify address for this test**. Do not change the existing user-site CNAME.

1. Visit https://app.netlify.com/start and log in.
2. Choose **Import an existing project**, provider **GitHub**.
3. Select `shewon06/prime-hr-mobile-test`.
4. Choose branch `main`, leave the build command empty, set publish directory to `.` (project root). The `netlify.toml` file also sets `publish = "."`.
5. Select **Deploy/Publish**. Open the exact new `*.netlify.app` address shown in your account. No URL is assumed before deployment.

Netlify automatically rebuilds on later GitHub pushes. The host will serve PWA files over HTTPS.

## Test installation

**Android:** Open the new Netlify address in Chrome → press the in-app **Install** button or browser menu ⋮ → Install app / Add to Home screen.

**iPhone:** Open the new Netlify address in Safari → Share → Add to Home Screen → Add.

Close your browser, launch the new PRIME HR Test icon, and try dummy Check In, Apply Leave, and Notices. No production records are involved.

## Files

- `index.html` — responsive employee app prototype and test-only local interactions
- `manifest.webmanifest` — app name, icons and standalone launch settings
- `sw.js` — offline service worker
- `icon-192.png`, `icon-512.png` — generic sample app icons, not official PRIME branding
- `netlify.toml` — static PWA hosting configuration

**Reminder:** This is an installation test. The planned actual PRIME HR NEXT LEVEL system needs a private backend, tested permission rules, company approvals and an employee account provisioning process.
