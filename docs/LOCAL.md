# Running and checking the site locally

Written after `npm ci` bricked a working checkout. Everything here is
Windows-PowerShell-safe.

---

## Two things that will bite you

**1. `&&` is not a statement separator in Windows PowerShell 5.1.** It is in
PowerShell 7 and in bash, but the shell that opens by default on this machine is
5.1, and `git fetch && git checkout x` fails with a parser error. Put each
command on its own line. Every command in this file is a single command for that
reason.

**2. `npm ci` deletes `node_modules` *before* it installs.** If any process is
holding a file in there — a running dev server, an editor, antivirus — the
delete fails partway and you are left with **no toolchain at all**, which is
what happened. The symptom is `'astro' is not recognized`.

So: **stop the dev server before any install**, and prefer `npm install` (which
patches in place) over `npm ci` (which wipes first) unless you specifically need
a clean lockfile install.

---

## For an agent: this machine's tooling

These were given verbally at the start of a session and lived nowhere, so every
new session rediscovered them by failing. They are here now.

**`gh` is not on a fresh PATH.** It is installed at `C:\Program Files\GitHub CLI`.
Invoke it by full path:

```
"C:/Program Files/GitHub CLI/gh.exe" pr create --repo TheVikashSingh/quickoper ...
```

**Never prefix a command with `cd <path> &&`.** It defeats every permission
pattern the operator has approved and triggers a prompt on every call. Use the
tools' own directory flags instead:

```
git -C C:/dev/quickoper status
```

```
npm --prefix C:/dev/quickoper run verify
```

**Multi-line `git commit -m` breaks in PowerShell 5.1.** Write the message to a
file and use `-F`:

```
git -C C:/dev/quickoper commit -F /path/to/message.txt
```

**Do not write long `node -e "..."` one-liners.** Bash mangled the quoting four
times in one session — `$`, backslashes and MSYS path conversion all interfere.
Write a real script file and run it, or use the editing tools. The same applies
to `curl` format strings: MSYS rewrites a leading `/` into a Windows path, so
`-w "/foo -> %{http_code}"` comes back as `C:/Program Files/Git/foo`. Set
`MSYS_NO_PATHCONV=1` or avoid leading slashes in literals.

**PDF text can be extracted** with `pdftotext -layout` (Git Bash ships it).
There is no Python on this machine and no PDF *writer* — the project's answer to
"produce a PDF" is the browser's print pipeline, which is also D11's answer for
the site itself.

---

## Normal loop: look at the site

Stop anything already on the port first (see below), then:

```
npm run dev
```

Opens `http://localhost:4321`. Hot-reloads on save.

**Restart it after switching branches.** Astro caches the route manifest, so a
page that exists on the new branch will 404 until you do.

## Checking the real built output

`npm run dev` serves a development build. The bytes measured by the budget gate,
and the HTML the gates actually inspect, come from a production build:

```
npm run build
```

Then serve it:

```
npm run preview
```

Opens `http://localhost:4321` serving `dist/` exactly as Cloudflare will.

## Running every check CI runs

One command, and it is the same list the pull request must pass:

```
npm run verify
```

That is: formatting, typecheck, Vitest, build, JS byte budget, internal links
and indexability, prose spacing, STATE.md counts, island prose slots, structured
data. It takes under a minute. If this passes, CI passes.

Individual gates, when you want one in isolation — each needs `npm run build`
first, because they all inspect `dist/`:

```
npm run budget
```

```
npm run links
```

```
npm run schema
```

`spacing`, `state` and `slots` work the same way.

---

## When something is wrong

### `'astro' is not recognized as an internal or external command`

`node_modules` is damaged or missing. Stop every node process first, then:

```
npm install
```

### `npm error code EPERM ... unlink ... lightningcss.win32-x64-msvc.node`

A running process is holding a file. Find it:

```
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId, CommandLine
```

Then stop the one that is a dev server (replace the number):

```
Stop-Process -Id 1234 -Force
```

Then install again.

### Port 4321 already in use

```
Get-NetTCPConnection -LocalPort 4321 -State Listen | Select-Object OwningProcess
```

Stop that process id with `Stop-Process` as above, or run on another port:

```
npm run dev -- --port 4322
```

### A gate fails and the message is not obvious

Every gate prints what it expected and what it found, and names the file or the
route. They are written to be read — the failure output *is* the documentation.
`check-js-budget` additionally prints a per-module breakdown when a page is over,
so you can see which import did it.

---

## What you cannot check locally

**Anything about how Google or an AI crawler treats the site.** Indexing,
rankings, rich results and citation behaviour are all post-launch, live-domain
questions. No local tool answers them, and any tool claiming to is guessing.

**Real-device rendering.** The gates measure bytes, links, spacing and structured
data. They do not look at the page. Several genuine defects here — a wrong chart
axis, a contrast failure, 49 missing spaces, slot paragraphs sitting flush —
passed every automated check and were found by opening the site. Open the site.
