# School Engagement Platform (multi-tenant SaaS)

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase Auth + Postgres with Row Level Security.
One deployment serves many schools; every row carries a `school_id` and RLS enforces isolation in the database.

## Setup
1. `cp .env.example .env.local` and fill in your Supabase URL, anon (publishable) key, and service-role key.
   The service-role key is used **only** in server actions (`src/lib/supabase/server.ts → createAdminClient`) to create auth users. Never prefix it with `NEXT_PUBLIC_`.
2. **Inspect your existing schema first** (Supabase → Table editor / `supabase db dump --schema public`). Migrations are written to be additive (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), but compare column names, especially `profiles`, against `0001`. Run on a staging branch first.
3. Apply, in order: `supabase/migrations/0001_init_school_saas.sql`, `0002_security_hardening.sql`, `0003_parent_role.sql`, then `0004_attendance_academics_parent_portal.sql`. Run on staging first and confirm all migrations complete successfully.
4. Make sure your existing Company Administrator has a `profiles` row with `role = 'super_admin'` and `school_id = NULL`. If your table has a NOT NULL on `school_id`, relax it: `alter table profiles alter column school_id drop not null;`
5. `npm install && npm run dev`
6. Run `supabase/tests/rls_isolation_test.sql` in the SQL editor (staging). It rolls back and prints PASS/FAIL notices.

## International Indian School branding
- `public/iis-abu-dhabi-logo.png` is the horizontal International Indian School Abu Dhabi logo used on the public landing page.
- `public/iis-shield.png` is the school shield used on sign-in and dashboard screens by default. A configured per-school `logo_url` takes priority in the tenant dashboard sidebar.
- The public footer, login page, and dashboard shell include the credit “Made by Muhammad Arsh”.

## Routes
| Role | Path |
|---|---|
| Super admin | `/super-admin`, `/super-admin/schools`, `/super-admin/admins` |
| School admin | `/school-admin` (+ people/parents, attendance, academics/grades, polls, ideas, announcements, issues, settings) |
| Teacher | `/teacher` (+ attendance register, gradebook, polls, ideas, announcements, issues) |
| Student | `/student` (+ attendance history, grades, announcements, polls, ideas, issues) |
| Parent / guardian | `/parent` (+ linked-child attendance, academic progress, announcements, student voice overview) |

## Security model
- UI role checks are convenience only; RLS is the boundary.
- Tenant isolation: every policy compares `school_id` to `current_school_id()` (a SECURITY DEFINER lookup of the caller's profile).
- One vote per student per poll: `unique (poll_id, voter_id)`; a trigger also checks the poll is open, the option belongs to it, and the voter is a student.
- Users cannot change their own `role` or `school_id`; students cannot alter idea/issue status.
- Suspended/cancelled schools are locked out of existing and new school data via restrictive policies.
- Attendance is one row per student per day; staff registers are filtered by class and date rather than displaying the full school roster. Class summary views avoid scanning all 2,000+ student profiles to build class filters.
- Grades are attached to assessments and students; database triggers validate that scores are within the maximum and that the student and assessment belong to the same class and school.
- Parents can only view attendance and results for students explicitly linked by a school administrator. Create parent accounts from People & Parents and select the child during account creation.

## Known limitations / next steps
- Not yet tested against a live Supabase project or a full production build in this offline environment. Successful sign-in still depends on valid users/passwords, correct `.env.local` Supabase settings, and the expected `profiles` row. Friendly UI messages cannot repair missing/incorrect live credentials by themselves.
- Logo is a URL field (no Storage upload yet). Add a Supabase Storage bucket with a per-school path policy.
- Types are hand-written; run `supabase gen types typescript` and re-enable typed clients.
- Add rate limiting, audit logging and password-reset email flow before launch.

## Deploy with GitHub + Vercel (recommended)

The application remains a Next.js app; no redesign or feature changes are required for this deployment path.

### 1. Prepare Supabase first

1. Open the Supabase project that this app should use.
2. In **Project Settings → API** (or **Data API**, depending on the dashboard version), copy the Project URL and the public `anon` / publishable key.
3. In the SQL Editor, review and apply the migrations in this exact order: `0001_init_school_saas.sql`, `0002_security_hardening.sql`, `0003_parent_role.sql`, `0004_attendance_academics_parent_portal.sql`. Do not blindly re-run against a school database without reviewing the existing schema and taking a backup.
4. In **Authentication → URL Configuration**, set the Site URL to the eventual Vercel production URL. Add the production URL and your Vercel preview URL pattern to the Redirect URLs allow-list as appropriate. The callback route is `/auth/callback`.
5. Confirm the required profile rows, roles, and Row Level Security policies exist before testing with real users.

### 2. Push the project to GitHub

1. Extract this ZIP.
2. Open the extracted project folder (the folder containing `package.json`) in VS Code.
3. Create a new **private** GitHub repository for the project.
4. From a terminal opened in that `schoolsaas` folder, run:

   ```bash
   git init
   git add .
   git status
   git commit -m "Prepare Student Voice Hub for deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

   Replace the repository URL with your actual GitHub repository URL. If Git says the repository is already initialized or a remote already exists, check `git status` and `git remote -v` rather than repeating initialization. Before committing, make sure `.env.local` and all real credentials are absent from `git status`.

### 3. Import it into Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import the GitHub repository.
3. Leave **Root Directory** as `./` because `package.json` is at the repository root.
4. Use the **Next.js** framework preset. Keep the standard build command (`npm run build`) and output settings; do not set a static export.
5. Under **Environment Variables**, add these values for the environments you intend to use (Production, and Preview if needed):
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your public anon/publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` — the secret service-role key, server-side only; add it only if the privileged Super Admin provisioning feature is needed
6. Deploy. Vercel will build from the connected GitHub repository. Future pushes to the connected branch will trigger deployments automatically.

### 4. Test the deployed site

- Open the production URL in a private/incognito browser window.
- Test login and logout, and verify that users are sent to the correct role dashboard.
- Test each role with separate test accounts. Confirm a parent can see only their linked child and one school's users cannot access another school's records.
- Test attendance, grades, announcements, polls, ideas, and issues using non-sensitive test data first.
- Check **Vercel → Project → Logs** and the browser console if something fails.
- If authentication redirects fail, re-check Supabase Site URL and Redirect URLs, then redeploy after changing Vercel environment variables.

### Deployment/security notes

- Never commit `.env.local`, a real `.env` file, or the Supabase service-role key. The `.env.example` file contains placeholders only.
- `NEXT_PUBLIC_*` variables are included in browser-side code; only put the Supabase project URL and public anon/publishable key there. The service-role key must remain server-only.
- Environment variable changes in Vercel require a new deployment to take effect.
- A successful Vercel build does not prove that the live Supabase schema, authentication settings, role records, or RLS policies are correct. Validate these separately before using real student data.
- This project has not been confirmed against your live Supabase instance from this environment. Treat the first deployment as a test/staging deployment and do not upload real student records until the school has approved the setup and security checks have passed.

## Student Portfolio (migration 0005)

The Student Portfolio lets students submit certificates and evidence files (PDF/JPG/PNG/WEBP, max 10 MB), and lets teachers and school administrators review submissions as **Verified** or **Needs changes**. Evidence is stored in a private Supabase Storage bucket and opened through short-lived signed URLs. Parent and public access are not enabled.

Before deploying this feature, run `supabase/migrations/0005_student_portfolio.sql` in the Supabase SQL Editor (or apply it through your normal migration workflow). It creates the portfolio table, row-level security policies, and private storage bucket. No new environment variables or npm packages are required.

## Hosting target

This package is prepared for GitHub + Vercel deployment as a Next.js application. Vercel detects the framework automatically; use the standard `npm run build` command. Configure the Supabase environment variables in Vercel before deploying.
