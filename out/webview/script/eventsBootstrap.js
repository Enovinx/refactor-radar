"use strict";
function onClick(e) {
    const target = e.target;
    // Handle Custom Dropdown
    const customDropdown = target?.closest('.custom-dropdown');
    const dropdownItem = target?.closest('.dropdown-item');
    if (customDropdown && !dropdownItem) {
        // Toggle dropdown
        const wasOpen = customDropdown.classList.contains('open');
        // Close all other dropdowns
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
        if (!wasOpen) {
            customDropdown.classList.add('open');
        }
        e.stopPropagation();
        return;
    }
    if (dropdownItem && customDropdown) {
        const value = dropdownItem.dataset.value;
        const dropdownId = customDropdown.dataset.id;
        if (value && dropdownId) {
            if (dropdownId === 'alerts-sort') {
                actions.updateAlertsSort(value);
            }
            else if (dropdownId === 'configs-section') {
                actions.updateConfigsSection(value);
            }
            else if (dropdownId === 'limit-display-mode') {
                actions.updateLimitDisplayMode(value);
            }
        }
        e.stopPropagation();
        return;
    }
    // Close dropdowns when clicking elsewhere
    document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
    const actionEl = target?.closest('[data-action]');
    if (!actionEl) {
        return;
    }
    const action = actionEl.dataset.action;
    if (!action) {
        return;
    }
    if (actionEl.classList.contains('alert-summary') && action !== 'openFile' && action !== 'toggleFileCard') {
        return;
    }
    switch (action) {
        case 'openFile':
            actions.setActiveFileCard(decodeFilePath(actionEl.dataset.file));
            actions.openFile(decodeFilePath(actionEl.dataset.file));
            break;
        case 'toggleFileCard':
            actions.toggleFileCard(decodeFilePath(actionEl.dataset.file));
            break;
        case 'copyPrompt': {
            const filePath = decodeFilePath(actionEl.dataset.file);
            const file = state.files.find(f => f.filePath === filePath);
            if (file) {
                actions.copyPrompt(filePath, file);
            }
            const originalText = actionEl.textContent;
            actionEl.textContent = 'Copied!';
            actionEl.classList.add('copied');
            setTimeout(() => {
                if (document.body.contains(actionEl)) {
                    actionEl.textContent = originalText;
                    actionEl.classList.remove('copied');
                }
            }, 2000);
            break;
        }
        case 'ignoreForLines':
            actions.ignoreForLines(decodeFilePath(actionEl.dataset.file), Number(actionEl.dataset.linecount || 0));
            break;
        case 'ignoreForever':
            actions.ignoreForever(decodeFilePath(actionEl.dataset.file));
            break;
        case 'copyFolderPrompt':
            actions.copyFolderPrompt(decodeFilePath(actionEl.dataset.folder), decodeFilePathList(actionEl.dataset.files));
            break;
        case 'ignoreFolder':
            actions.ignoreFolder(decodeFilePath(actionEl.dataset.folder));
            break;
        case 'toggleFolderExpand':
            actions.toggleFolderExpand(decodeFilePath(actionEl.dataset.folder));
            break;
        case 'toggleFolderPrompt':
            actions.toggleFolderPrompt(decodeFilePath(actionEl.dataset.folder));
            break;
        case 'removeLineBonus':
            actions.removeLineBonus(decodeFilePath(actionEl.dataset.file));
            break;
        case 'cancelPermanentIgnore':
            actions.cancelPermanentIgnore(decodeFilePath(actionEl.dataset.file));
            break;
        case 'removeCustom':
            if (actionEl.dataset.language) {
                removePredictedCustomConfig(actionEl.dataset.language);
                renderRoot();
                actions.removeCustom(actionEl.dataset.language);
            }
            break;
        case 'addCustom':
            actions.addCustom();
            break;
        case 'switchTab':
            if (actionEl.dataset.tab === 'alerts' || actionEl.dataset.tab === 'configs' || actionEl.dataset.tab === 'prompts') {
                actions.switchTab(actionEl.dataset.tab);
            }
            break;
        case 'toggleSection':
            if (actionEl.dataset.section === 'files' || actionEl.dataset.section === 'settings') {
                actions.toggleSection(actionEl.dataset.section);
            }
            break;
        case 'switchConfigTab':
            if (actionEl.dataset.tab === 'language' || actionEl.dataset.tab === 'ignore' || actionEl.dataset.tab === 'scan') {
                actions.switchConfigTab(actionEl.dataset.tab);
            }
            break;
        case 'addFolder':
            actions.addIgnoredFolder();
            break;
        case 'removeFolder':
            if (actionEl.dataset.folder) {
                actions.removeIgnoredFolder(actionEl.dataset.folder);
            }
            break;
        case 'toggleGitIgnore': {
            const checkbox = actionEl;
            actions.updateIgnoreGitIgnore(Boolean(checkbox.checked));
            break;
        }
        case 'toggleHideFolders': {
            const checkbox = actionEl;
            actions.updateHideFolders(Boolean(checkbox.checked));
            break;
        }
        case 'toggleHideFoldersWhileSearching': {
            const checkbox = actionEl;
            actions.updateHideFoldersWhileSearching(Boolean(checkbox.checked));
            break;
        }
        case 'toggleExpandFoldersOnToggle': {
            const checkbox = actionEl;
            actions.updateExpandFoldersOnToggle(Boolean(checkbox.checked));
            break;
        }
        case 'toggleShowLineCount': {
            const checkbox = actionEl;
            actions.updateShowLineCount(Boolean(checkbox.checked));
            break;
        }
        case 'savePromptTemplate':
            actions.savePromptTemplate();
            break;
        case 'resetPromptTemplate':
            actions.resetPromptTemplate();
            break;
        case 'saveBatchPromptTemplate':
            actions.saveBatchPromptTemplate();
            break;
        case 'resetBatchPromptTemplate':
            actions.resetBatchPromptTemplate();
            break;
        case 'insertPromptVariable':
            if (actionEl.dataset.variable) {
                actions.insertPromptVariable(actionEl.dataset.variable);
            }
            break;
        case 'insertBatchPromptVariable':
            if (actionEl.dataset.variable) {
                actions.insertBatchPromptVariable(actionEl.dataset.variable);
            }
            break;
        case 'togglePuzzle':
            toggleLoadingPuzzle(Number(actionEl.dataset.index));
            break;
    }
}
function onChange(e) {
    const target = e.target;
    if (!target) {
        return;
    }
    if (target instanceof HTMLSelectElement && target.id === 'alerts-sort') {
        actions.updateAlertsSort(target.value);
        return;
    }
    if (target instanceof HTMLSelectElement && target.id === 'configs-section') {
        actions.updateConfigsSection(target.value);
        return;
    }
    if (target instanceof HTMLInputElement && target.id === 'max-files-to-scan') {
        actions.updateMaxFilesToScan(target.value);
        return;
    }
    if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'updateThreshold' || !target.dataset.language) {
        return;
    }
    actions.updateThreshold(target.dataset.language, target.value);
}
function onInput(e) {
    const target = e.target;
    if (!target) {
        return;
    }
    if (target.id === 'ignored-search') {
        actions.updateIgnoredSearch(target.value);
    }
    else if (target.id === 'configs-search') {
        actions.updateConfigsSearch(target.value);
    }
    else if (target.id === 'alerts-search') {
        actions.updateAlertsSearch(target.value);
    }
}
function onKeyDown(e) {
    const target = e.target;
    if (e.key === 'Enter' && (target?.id === 'new-ext' || target?.id === 'new-lines')) {
        actions.addCustom();
    }
    if (e.key === 'Enter' && target?.id === 'new-folder') {
        actions.addIgnoredFolder();
    }
}
function onDocumentClick(e) {
    const target = e.target;
    if (!target?.closest('.custom-dropdown')) {
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
    }
}
window.addEventListener('beforeunload', () => {
    if (loadingMessageTimer !== undefined) {
        window.clearInterval(loadingMessageTimer);
        loadingMessageTimer = undefined;
    }
    if (loadingProgressTimer !== undefined) {
        window.clearInterval(loadingProgressTimer);
        loadingProgressTimer = undefined;
    }
});
window.addEventListener('message', (e) => {
    if (e.data.type === 'updateState') {
        state = e.data.state;
        if (!state.isLoading) {
            state.loadingProgress = 100;
        }
        renderRoot();
    }
});
const root = document.getElementById('root');
if (root) {
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeyDown);
}
document.addEventListener('click', onDocumentClick, true);
renderRoot();
