# Production environment-variable checklist

| Variable | Where | Notes |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Vercel (all envs) | https://<ref>.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Vercel (all envs) | anon / publishable key (RLS-restricted) |
| SUPABASE_SERVICE_ROLE_KEY | Vercel (server) | never exposed to browser |
| XAI_API_KEY | Vercel (server) | xAI console |
| XAI_DEFAULT_MODEL | Vercel | grok-4.3 |
| ADMIN_PASSWORD | Vercel (server) | 16+ chars |
| ADMIN_SESSION_SECRET | Vercel (server) | openssl rand -hex 32 |
| RUNNER_SECRET | Vercel (server) + Supabase Vault | openssl rand -hex 32; same value in vault secret `mindvirus_runner_secret` |
| APP_URL | Vercel | https://mindvirusexperiment.com |
| TEST_MODE | Vercel | false |

Post-deploy:
1. `select cron.schedule(...)` heartbeat (README) pointing at APP_URL/api/runner/tick.
2. Verify: `curl -X POST -H "x-runner-secret: $RUNNER_SECRET" $APP_URL/api/runner/tick` → `{"skipped":"no running experiment"}`.
3. Log in at /admin, create draft, START.
