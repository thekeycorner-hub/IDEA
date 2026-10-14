ID+EA CLIENT DASHBOARD — UI + BACKEND

1. Website: keep index.html, style.css, script.js, client-access.html, client-access.js, client-dashboard.html, client-dashboard.css, client-dashboard.js, site-config.js and assets/ together.
2. Apps Script: use the provided Code_UPDATED.gs content to replace Code.gs ONLY IF it matches your current working Code.gs; otherwise add the clientLogin dispatch in doPost and clientProjects / projectDashboard dispatch in doGet. Keep ClientDashboard.gs and its already configured access codes.
3. Redeploy Apps Script as a new version. In site-config.js set API_URL to the deployed /exec URL.
4. On your real host, check that browser GET requests to the Apps Script endpoint work from your domain. Google Apps Script ContentService redirects and cross-origin POST calls can fail due to browser CORS restrictions. If requests fail, deploy a same-origin backend proxy or serve the client pages with Apps Script HTML Service. Do NOT disable server-side authentication or expose Sheets.
5. Enter real data in ProjectDetails and EligibleExpenses; project image needs a browser-accessible image URL. Party balances need a proper ledger (current backend returns no parties).
6. Existing demo data appears ONLY when API_URL is blank. DEMO123 is not real security.
7. Use the access page to login; token is scoped to one project and expires after 30 minutes.

Accounting: Materials + Workforce + EligibleExpenses = monthly expenditure. PMC percentage and GST apply to that basis. Cash Out is displayed separately, not added again.
