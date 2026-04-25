# Refactor Radar 🎯

**Warns you when files get too long — and hands you a ready-to-paste AI refactor prompt in one click.**

---

## Features

- 📏 **Line count status bar** — always visible, colour-coded (green / yellow / red)
- ⚠️ **Smart notifications** — fires on save when your file crosses the warn or error threshold
- 🤖 **One-click AI prompt** — copies a detailed, structured refactor prompt (with your full file code included) straight to your clipboard
- 🛠️ **Fully configurable** — set your own thresholds, ignored languages, and even a custom prompt template
- 🔕 **Notify-once mode** — suppress repeat alerts for the same file in a session

---

## How It Works

1. Open any code file.
2. The status bar shows the current line count.
3. When you **save** and the file exceeds your threshold, a notification pops up.
4. Click **"Copy AI Prompt"** — the full file + a structured refactor request is copied to your clipboard.
5. Paste into Claude, ChatGPT, Cursor, or any AI agent. Done.

You can also trigger it manually via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):
- `Refactor Radar: Copy AI Refactor Prompt`
- `Refactor Radar: Check Current File`

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `refactorRadar.warnThreshold` | `200` | Lines before yellow warning |
| `refactorRadar.errorThreshold` | `400` | Lines before red alert |
| `refactorRadar.showStatusBar` | `true` | Show line count in status bar |
| `refactorRadar.checkOnSave` | `true` | Notify on save |
| `refactorRadar.checkOnType` | `false` | Update status bar while typing |
| `refactorRadar.ignoredLanguages` | `["markdown","plaintext","json"]` | Language IDs to skip |
| `refactorRadar.customPromptTemplate` | `""` | Custom prompt (see below) |
| `refactorRadar.notifyOnlyOnce` | `false` | Suppress repeat alerts per session |

---

## Custom Prompt Template

Leave `customPromptTemplate` empty to use the built-in prompt. Or write your own using these placeholders:

| Placeholder | Value |
|---|---|
| `{filename}` | `MyComponent.tsx` |
| `{language}` | `typescriptreact` |
| `{lineCount}` | `347` |
| `{warnThreshold}` | `200` |
| `{code}` | Full file contents |

**Example:**
```json
"refactorRadar.customPromptTemplate": "This {language} file ({filename}) has {lineCount} lines. Split it into smaller modules:\n\n```{language}\n{code}\n```"
```

---

## The Default AI Prompt

When you click "Copy AI Prompt", the clipboard gets:

```
# Refactor Request

## Context
- File: `MyComponent.tsx`
- Language: typescriptreact
- Current size: 347 lines (threshold: 200)

## Task
This file has grown too large...

1. Identify the main responsibilities
2. Propose a split strategy
3. Show the refactored code for each new file
4. Highlight any other code smells
5. Keep all existing behaviour intact

## Code
\`\`\`typescriptreact
// ... your full file here ...
\`\`\`
```

---

## Install from Source

```bash
git clone <your-repo>
cd refactor-radar
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host, or package it:

```bash
npm install -g vsce
vsce package
# → refactor-radar-1.0.0.vsix
code --install-extension refactor-radar-1.0.0.vsix
```

---

## Why Not Just Use "Too Many Lines"?

That extension flags line counts — but gives you nothing to do about it. Refactor Radar closes the loop: it sees the problem *and* immediately arms you with everything an AI agent needs to fix it.
