# Refactor Radar

Refactor Radar is a VS Code extension that monitors file lengths and provides structured AI prompts to assist with refactoring large files. It helps maintain code quality by alerting you when files exceed defined thresholds and simplifying the process of preparing code for AI analysis.

## Features

* Line count status bar: Provides real-time visibility of file size.
* AI Prompt Generation: Copies a customisable refactor prompt with full file content to the clipboard.
* Configuration: Customizable thresholds, ignored languages, and prompt templates.
* Activity Bar View: Access extension features and settings from the VS Code Activity Bar.

## Setup

You can get our extension from our website *here*

Otherwise if you want to modify it, you can install it from source:

To install the extension from source, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/Enovinx/refactor-rader
   cd refactor-radar
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Launch and Test:
   * Open the project in VS Code.
   * Press F5 to launch the Extension Development Host.

## Settings

The extension can be configured through VS Code settings:

| Setting | Default | Description |
|---|---|---|
| refactorRadar.defaultThreshold | 300 | Default line threshold for file types. |
| refactorRadar.refreshIntervalMs | 5000 | Minimum time between scans in milliseconds. |

## Usage

1. Open a code file in VS Code.
2. Monitor the line count in the status bar.
3. If a file exceeds the threshold, use the notification or the command palette to copy an AI refactor prompt.
4. Paste the prompt into your preferred AI tool to begin the refactor process or refactor it yourself.
