The full specification is in `PCCraft_Master_Spec_v4.md` in this directory.
Read the entire spec before writing a single file. It is the only source of truth
for what to build, in what order, and how. Do not invent behaviour that isn't in
it. Do not silently omit behaviour that is.

---

## Module Execution Rules

The spec defines the modules and their order — follow that order exactly.
For every module, do all of the following before moving to the next:

1. Re-read the relevant spec section for that module before writing any file.
2. Build backend and frontend together — do not finish all backend modules first.
3. Write complete files — no `pass`, no `# TODO`, no `...`, no stub bodies.
   If the spec defines 8 fields on a model, the model has 8 fields.
4. Use exact names from the spec — field names, endpoint paths, component names,
   file paths, store keys. Do not rename anything for convenience.
5. Use the Model-to-App Import Map in the spec for every cross-app FK import.
6. Run `python manage.py makemigrations <app_name>` per app (not globally),
   then `python manage.py migrate`. Fix any warnings before continuing.
7. Run `python manage.py check` — must pass with zero errors after every migration.
8. Run a smoke test — at minimum one `curl` against a live endpoint or one
   `python manage.py shell -c` import check. If it fails, fix it before proceeding.
9. Remind me to start a new session because the model needs refresh after each of the 3 module.

---

## Completion Gate — A Module Is Done Only When ALL 6 Are True

Do not start the next module until every item below is confirmed:

1. **All files exist** — every file the spec lists for this module is on disk with
   full, non-placeholder content. No `pass`, no `# TODO`, no `...`. Re-read the master prompt for relevant module section to verify. 
2. **All behaviour implemented** — every endpoint, every serializer field, every
   model field, every component, every service method defined in the spec section
   for this module is present and working. Nothing skipped.
3. **No import errors** — `python manage.py check` passes with zero errors.
4. **Migrations clean** — `makemigrations` and `migrate` ran with no warnings or errors.
5. **Smoke test passes** — a live check confirms the module works end-to-end:
   A failed smoke test is not a reason to
   move on — it is a reason to stop and fix.
6. **Re-read before proceeding** — run these two commands before starting the next
   module, every time, no exceptions:
   ```bash
   cat CLAUDE.md
   ```
   Then re-read the next module's section in `PCCraft_Master_Spec_v4.md`.
   Only after both are done should work on the next module begin.

---

## Code Quality — Enforced on Every File

- Every serializer lists every field defined in the spec for that model.
- Every view implements `get_queryset`, `perform_create`, `perform_update` in full —
  no inherited defaults left unimplemented where the spec specifies behaviour.
- Every Celery task goes in `tasks.py` in its app. Use `@shared_task`.
- Never `from django.contrib.auth.models import User` — always `get_user_model()`.
- Every new Django app has `apps.py` with an `AppConfig` subclass and is registered
  in `INSTALLED_APPS` using the dotted path: `'apps.accounts.apps.AccountsConfig'`.
- All API calls in React go through `src/services/axiosInstance.js` — no raw `fetch`.
- Auth state lives in Zustand (`useAuthStore`) — never in `localStorage`.
- Route strings always come from `src/routes/routePaths.js` — no hardcoded paths.
- Tailwind v4 only — `@theme` tokens in `globals.css`, no `tailwind.config.js`.

---

## Error Handling Protocol

**When a command or test fails:**
1. Read the full error — do not skip the stack trace.
2. Fix the root cause. Do not stub around it or comment it out.
3. Re-run the failing command to confirm it passes before continuing.
4. If fixing required deviating from the spec, add an inline comment explaining why.

**Stop and ask only when:**
- A system-level dependency is missing and needs `sudo` or OS-level intervention.
- The spec has an unresolvable contradiction (not just a brief section — read it again first).
- A third-party package is gone or its API is broken in a way that requires a design call.

**Never stop for:**
- Choosing between two equally valid implementations — pick the simpler one, note it.
- A brief spec section — infer the reasonable behaviour, note the inference.
- A file that already exists — overwrite it with the correct content.
- Any error you can fix — fix it.

---

## Starting Up

1. Read `PCCraft_Master_Spec_v4.md` in full.
2. Set up the environment exactly as the spec defines.
3. Confirm `python manage.py check` passes and `npm run dev` loads in the browser.
4. Then begin building the project module by module.
