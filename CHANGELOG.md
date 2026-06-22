# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-06-22

### Added
- **Single Page Application (SPA) Shell**: Combined 6 legacy pages into one cohesive, modern dashboard in `index.html`.
- **Plugin Architecture**: Added a registry-based system where algorithm plugins extend `AlgorithmPlugin` and self-register (`naive_bayes`, `knn`, `c45`, `kmeans`, `regression`, `apriori`).
- **Off-Main-Thread Web Worker**: Implemented `generic_worker.js` and `WorkerFactory` to process large dataset calculations asynchronously, avoiding browser freezing.
- **Export to Excel with Formulas**: Standardized SheetJS export containing live Excel formulas, allowing users to trace computations step-by-step in spreadsheets.
- **Design Token System & Modular CSS**: Extracted CSS styles into specialized files: `tokens.css`, `reset.css`, `layout.css`, `components.css`, `forms.css`, `tables.css`, and `utilities.css`.
- **Fully Offline Support**: Downloaded IBM Plex fonts locally and vendored `xlsx.full.min.js` to ensure the app works in completely offline environments.
- **DOM Helper Module**: Created `dom_helper.js` (`window.DOMHelper`) providing a clean builder API for programmatically generating interactive UI elements for future plugins.
- **Robust Security**: Hardened HTML escape routines (`escapeHTML`), sanitized Excel formulas (`sanitizeFormula`) to protect against CSV/formula injection.
- **Comprehensive Documentation**: Added architecture specs, plugin development guides, state management charts, data flow logs, and contributor setup guidelines.

### Changed
- Re-routed CSV parser and train-test partition workflows into a centralized data pipeline (`pipeline.js`).
- Migrated 6 machine learning algorithms from global inline scripts to modular plugin classes under `src/plugins/`.

### Removed
- Removed legacy individual HTML pages and associated separate script files.

---

[2.0.0]: https://github.com/username/project/releases/tag/v2.0.0
