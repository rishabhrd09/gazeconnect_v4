# GazeConnect Pro — New Private Repository Migration Guide

## PROMPT FOR AI AGENT

Copy everything below this line and give it to your local AI agent:

---

I need your help creating a new private GitHub repository from an existing local codebase. Follow these steps EXACTLY. Do NOT skip any verification step. Do NOT modify any files. Ask me before running any destructive command.

## CONTEXT

- **Source**: `C:\GAZECONNECT\latest_claude_code\latest_final_branch\latest_main\prediction_upgrade\gazeconnect_v3`
- **Source branch**: `feature/prediction_upgrade` (has uncommitted local changes I want to keep)
- **Goal**: Create a NEW private GitHub repo with all code, push it, and verify it works — WITHOUT touching the original repo
- **My GitHub username**: (I will tell you when you ask)
- **New repo name**: (I will tell you when you ask, e.g. `gazeconnect-v4` or whatever I choose)

## STEP 1: VERIFY CURRENT STATE (DO NOT SKIP)

Run these commands to confirm the source is healthy:

```bash
cd "C:\GAZECONNECT\latest_claude_code\latest_final_branch\latest_main\prediction_upgrade\gazeconnect_v3"
git branch --show-current
# Should show: feature/prediction_upgrade

git status
# Will show uncommitted changes — that's expected and correct

git log --oneline -5
# Show me the last 5 commits so I can verify
```

**Ask me**: "What GitHub username and new repo name should I use?"
Wait for my answer before proceeding.

## STEP 2: CREATE NEW FOLDER (COPY, NOT MOVE)

```bash
# Create a completely separate copy — DO NOT use git clone, DO NOT delete source
# Using robocopy on Windows to preserve everything including hidden files

robocopy "C:\GAZECONNECT\latest_claude_code\latest_final_branch\latest_main\prediction_upgrade\gazeconnect_v3" "C:\GAZECONNECT\gazeconnect_new_repo" /E /COPY:DAT /R:1 /W:1 /XD node_modules .git __pycache__ dist out .vite

# Verify the copy
dir "C:\GAZECONNECT\gazeconnect_new_repo"
# Should see: package.json, python/, src/, electron/, tobii-helper/, setup scripts, etc.
```

**IMPORTANT**: We exclude `node_modules`, `.git`, `__pycache__`, `dist`, `out`, `.vite` because:
- `node_modules` will be reinstalled fresh (ensures clean dependencies)
- `.git` — we want a FRESH git history, not the old one
- `__pycache__`, `dist`, `out`, `.vite` — build artifacts, will be regenerated

## STEP 3: VERIFY ALL CRITICAL FILES EXIST IN THE COPY

```bash
cd "C:\GAZECONNECT\gazeconnect_new_repo"

# Core application files
dir package.json
dir vite.config.ts
dir tsconfig.json
dir electron\main.ts
dir python\main.py

# Setup scripts (CRITICAL — these are what make the app self-installing)
dir setup.bat
dir start-dev.bat
dir build-installer.bat

# If setup.bat doesn't exist, check for alternative names:
dir *.bat
dir setup*
dir install*

# Key source directories
dir src\screens\
dir src\components\core\
dir python\services\
dir python\data\
dir tobii-helper\

# Python dependencies file
dir python\requirements.txt
# OR
dir requirements.txt

# Electron files
dir electron\preload.ts
```

**Show me the output.** If any critical file is missing, STOP and tell me.

## STEP 4: CREATE .gitignore (BEFORE git init)

Create or verify `.gitignore` exists with these entries:

```
# Dependencies
node_modules/
python/__pycache__/
python/**/__pycache__/
__pycache__/
*.pyc

# Build outputs
dist/
out/
.vite/
*.exe
!setup.bat
!start-dev.bat
!build-installer.bat

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS files
Thumbs.db
Desktop.ini
.DS_Store

# Environment / Secrets
.env
.env.local
.env.*.local
credentials.json
*.pem
*.key

# Tobii build artifacts (but keep source)
tobii-helper/TobiiGazeHelper/bin/
tobii-helper/TobiiGazeHelper/obj/

# Logs
*.log
logs/

# Patient data (privacy — NEVER commit)
python/data/patient_data/
python/data/sessions/
```

## STEP 5: INITIALIZE FRESH GIT REPO

```bash
cd "C:\GAZECONNECT\gazeconnect_new_repo"

git init
git checkout -b main

# Stage everything
git add -A

# Review what will be committed — look for anything suspicious
git status

# Check for accidentally staged sensitive files
git diff --cached --name-only | findstr /i "env credential secret key patient_data sessions"
# If anything shows up, STOP and ask me
```

**Show me the staged file list.** I want to verify no sensitive data is included.

## STEP 6: CREATE PRIVATE GITHUB REPO

```bash
# Make sure gh CLI is authenticated
gh auth status

# If not authenticated, tell me to run:
#   gh auth login

# Create the private repo (MUST be --private)
gh repo create <MY_USERNAME>/<NEW_REPO_NAME> --private --description "GazeConnect Pro - Medical AAC app for ALS patients using Tobii Eye Tracker 5" --source . --remote origin
```

**VERIFY it says "private"** in the output. If it says public, IMMEDIATELY run:
```bash
gh repo edit <MY_USERNAME>/<NEW_REPO_NAME> --visibility private
```

## STEP 7: INITIAL COMMIT AND PUSH

```bash
cd "C:\GAZECONNECT\gazeconnect_new_repo"

git commit -m "Initial commit: GazeConnect Pro v3 — complete AAC application

Medical-grade AAC app for ALS/MND patients using Tobii Eye Tracker 5.
- Electron 28 + React 18 + TypeScript + Vite 5
- Python 3.10+ asyncio WebSocket backend
- .NET 6.0 Tobii Eye Tracker bridge
- OptiKey-parity gaze processing pipeline
- 5-layer word prediction (N-gram + Smart Bigrams + CIFG-LSTM + Datamuse + Patient)
- 110 blocked harmful words in prediction guardrails
- Bilingual: English + Hindi
- Self-installing setup scripts for Windows"

git push -u origin main
```

## STEP 8: VERIFY THE PUSH WORKED

```bash
# Check remote
gh repo view <MY_USERNAME>/<NEW_REPO_NAME>

# Verify it shows as PRIVATE
gh repo view <MY_USERNAME>/<NEW_REPO_NAME> --json isPrivate -q .isPrivate
# Must output: true

# Verify files are on GitHub
gh api repos/<MY_USERNAME>/<NEW_REPO_NAME>/contents --jq '.[].name' | head -20
```

## STEP 9: VERIFY ORIGINAL REPO IS UNTOUCHED

```bash
# Go back to original
cd "C:\GAZECONNECT\latest_claude_code\latest_final_branch\latest_main\prediction_upgrade\gazeconnect_v3"

# Confirm branch is still the same
git branch --show-current
# Should show: feature/prediction_upgrade

# Confirm uncommitted changes are still there
git status
# Should show the same modified files as before

# Confirm remote is still the OLD repo
git remote -v
# Should show the ORIGINAL repo URL, NOT the new one
```

**If anything looks different from what it was before, STOP and tell me immediately.**

## STEP 10: TEST THE NEW REPO WORKS (FRESH CLONE)

```bash
# Clone to a THIRD location to test
cd C:\GAZECONNECT
git clone https://github.com/<MY_USERNAME>/<NEW_REPO_NAME>.git gazeconnect_clone_test

cd gazeconnect_clone_test

# Run the setup script
# This should install Node.js deps, Python deps, and .NET deps automatically
setup.bat

# After setup completes, try starting the app
start-dev.bat --simulate
```

**If setup.bat fails**, show me the error. Common fixes:
- Node.js not installed → `winget install OpenJS.NodeJS.LTS`
- Python not installed → `winget install Python.Python.3.11`
- .NET SDK not installed → `winget install Microsoft.DotNet.SDK.6`

## STEP 11: CLEANUP TEST CLONE

Once verified working:
```bash
# Remove the test clone (it was just for verification)
rmdir /s /q "C:\GAZECONNECT\gazeconnect_clone_test"
```

The copy at `C:\GAZECONNECT\gazeconnect_new_repo` is your new working directory.

---

## SAFETY CHECKLIST (verify all before declaring done)

- [ ] New repo is PRIVATE on GitHub
- [ ] Original repo at `C:\GAZECONNECT\...\gazeconnect_v3` is completely untouched
- [ ] Original branch `feature/prediction_upgrade` still has its uncommitted changes
- [ ] Original remote still points to the OLD repo
- [ ] No `.env`, credentials, patient data, or secrets were pushed
- [ ] `setup.bat` exists in the new repo and works on fresh clone
- [ ] `start-dev.bat` exists and can launch the app
- [ ] All 13 screens folder exists under `src/screens/`
- [ ] Python backend files exist under `python/`
- [ ] Tobii helper source exists under `tobii-helper/`
- [ ] `python/data/smart_bigrams.json` exists (36KB)
- [ ] `python/ml/` exists with ONNX model (~1.9MB)

## IF SOMETHING GOES WRONG

- **Accidentally modified original repo**: `cd` to original, run `git checkout .` to restore tracked files. Untracked files won't be affected.
- **New repo is public**: `gh repo edit <MY_USERNAME>/<NEW_REPO_NAME> --visibility private`
- **Pushed sensitive files**: `git filter-branch` or `git filter-repo` to remove from history, then force push. Tell me and I'll guide you.
- **Setup script doesn't work in clone**: The setup scripts are Windows batch files. Make sure you're running from CMD or PowerShell (not Git Bash for .bat files).

## FUTURE WORKFLOW

Once the new repo is set up, your workflow becomes:

```bash
cd "C:\GAZECONNECT\gazeconnect_new_repo"

# Make changes...

# Commit
git add <specific files>
git commit -m "description of changes"

# Push
git push origin main

# Or create feature branches
git checkout -b feature/my-new-feature
# ... work ...
git push -u origin feature/my-new-feature
# Then create PR on GitHub
```

The old repo stays frozen as a backup. You never need to touch it again unless you want to reference the git history.
