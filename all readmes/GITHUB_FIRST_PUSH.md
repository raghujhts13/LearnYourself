# GitHub: first push from the `LYS` folder (security checklist)

Use this folder as the **only** git root so GitHub never receives parent junk (`LYS.zip`, other projects, etc.).

## 1. What must **not** reach GitHub

| Item | Why | How it’s blocked |
|------|-----|------------------|
| **`.env.local`** | Real API keys & secrets | `.gitignore`: `.env*` + `!.env.example` |
| **`server-providers.yml`** | Often holds keys | `.gitignore`: `server-providers.yml`, `server-providers-*.yml` |
| **`.vercel/`** | Project linkage / tokens | `.gitignore`: `.vercel` |
| **`*.pem`** | TLS / private keys | `.gitignore`: `*.pem` |
| **`*credentials*.json`**, **`*-sa.json`** | Cloud service accounts | `.gitignore` (see repo root `.gitignore`) |
| **`*.zip` / `*.tar`** | May bundle `.env` or `node_modules` | `.gitignore` |
| **`/data`**, **`/logs`** | Runtime data | `.gitignore` |

**Safe to commit:** `.env.example` (placeholders only, no real values).

## 2. Before every `git add` / commit

Run from **`LYS`** (this directory):

```powershell
cd d:\path\to\LYS
git check-ignore -v .env.local
```

You should see `.env.local` listed as ignored.

```powershell
git add .
git diff --cached --name-only | Select-String "\.env"
```

Only **`.env.example`** should appear (not `.env.local`).

Optional quick scan:

```powershell
git diff --cached | Select-String -Pattern "sk-[a-zA-Z0-9]{20,}" -SimpleMatch:$false
```

(Should return nothing if no OpenAI-style keys were staged.)

## 3. First-time setup (clean repo)

```powershell
cd d:\path\to\LYS
git init
git add .
git status
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<org-or-you>/<repo>.git
git push -u origin main
```

## 4. Repo root = `LYS` only

- **Do** run `git init` **inside** `LYS`.
- **Don’t** run `git init` in the parent folder unless you carefully ignore everything except `LYS/` (easy to get wrong).

## 5. If your branch already exists on GitHub

- **Diverged history** (`ahead` / `behind`): coordinate with maintainers. Common options:
  - `git pull --rebase origin main` then push, or
  - fork → set `origin` to your fork → push (no access needed on upstream).

- **403 on push**: your GitHub user needs **write** access, or push to **your fork** instead.

## 6. Broken merge / “Cannot merge” / index errors

If `git merge --abort` fails:

1. Ensure no other git process is running; delete `.git\index.lock` if it exists **and** no git command is active.
2. If you **can discard** all uncommitted changes:  
   `git reset --hard HEAD`  
   then `git merge --abort` (if still merging).
3. If you **must keep** work: copy the whole `LYS` folder to a backup, then fix or re-clone.

## 7. If secrets were ever committed

Removing the file in a new commit **does not** remove them from history. Rotate those keys, then use GitHub guidance on removing secrets from history (or delete/recreate the repo if nothing else depends on it).

---

For product documentation, see [`version1-app.md`](./version1-app.md) and [`.env.example`](./.env.example).
