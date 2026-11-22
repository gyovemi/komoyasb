---
name: Feature Request
about: Suggest an idea or enhancement for komoyasb
title: '[FEAT] '
labels: ['enhancement', 'triage']
assignees: ''
---

### Proposal Summary
A clear and concise summary of the proposed enhancement or new feature.

### Motivation & Use Case
What problem does this feature solve? How does it improve the user experience, desktop performance, or modular workflow compared to existing solutions?

### Subsystem Scope
Select all subsystems impacted by this proposal:
- [ ] Window Management (`komorebi` / `whkd`)
- [ ] Status Bar (`yasb` layouts, widgets, or styles)
- [ ] Shell & Launchers (`Flow Launcher` / `FluentFlyout`)
- [ ] DWM & Shell Mods (`Windhawk` or native fallbacks)
- [ ] Performance Engine (`performance.json` / EcoQoS / profiles)
- [ ] Theme System (`themes/*.json` tokens or compiler)
- [ ] Control Center App (`ui/` React or Tauri commands)
- [ ] Automation & Scripts (`install.ps1`, `uninstall.ps1`, `bootstrap.ps1`)

### Proposed Architecture & Solution
Describe how the feature should be designed, configured, or integrated into the declarative configuration model.

```json
// If proposing schema changes or configuration tokens, provide a sample snippet
```

### Rootless Compatibility Consideration
Does this feature maintain zero-UAC execution for standard Windows users (`-NoAdmin`)?
- [ ] Fully operational in user space (`HKCU` / `%LOCALAPPDATA%`)
- [ ] Requires administrative privileges with an automated userland fallback
- [ ] Strictly requires administrative privileges (explain justification below)

### Alternatives Considered
Describe any alternative solutions, external tools, or workarounds you have considered.
