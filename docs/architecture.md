# Architecture Overview

## ML Manual Calculator — SPA Platform

### Visi Proyek

Platform edukasi Machine Learning berbasis web yang menampilkan **seluruh proses perhitungan manual** algoritma ML secara transparan, step-by-step, dan visual — langsung di browser tanpa server.

### Prinsip Arsitektur

1. **Fully Client-Side** — Tidak ada backend, semua berjalan di browser
2. **Offline-First** — Semua dependensi (fonts, libraries) tersedia lokal
3. **Plugin-Based** — Setiap algoritma adalah plugin independen
4. **Worker-Isolated** — Komputasi berat berjalan di Web Worker thread
5. **Zero Build Tools** — Tidak butuh bundler, langsung serve HTML

---

## Diagram Arsitektur

```
┌────────────────────────────────────────────────────────┐
│                     index.html                         │
│              (Single Page Application Shell)           │
├────────────────────────────────────────────────────────┤
│                                                        │
│   ┌─────────────┐   ┌─────────────┐   ┌────────────┐ │
│   │  core_ui.js  │   │ registry.js │   │state_mgr.js│ │
│   │  (SPA Shell) │◄─►│ (Plugin Map)│   │ (App State)│ │
│   └──────┬───────┘   └──────┬──────┘   └────────────┘ │
│          │                  │                          │
│   ┌──────▼──────────────────▼──────────────────────┐  │
│   │              Algorithm Plugins                  │  │
│   │  ┌──────────┐ ┌──────┐ ┌─────┐ ┌───────────┐  │  │
│   │  │NaiveBayes│ │ KNN  │ │ C45 │ │ K-Means   │  │  │
│   │  └──────────┘ └──────┘ └─────┘ └───────────┘  │  │
│   │  ┌──────────┐ ┌────────┐                       │  │
│   │  │Regression│ │Apriori │                       │  │
│   │  └──────────┘ └────────┘                       │  │
│   └────────────────────┬───────────────────────────┘  │
│                        │ postMessage()                 │
│   ┌────────────────────▼───────────────────────────┐  │
│   │          Generic Web Worker Thread              │  │
│   │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │  │
│   │  │pipeline.js│ │  lcg.js  │ │algorithm_if.js │ │  │
│   │  │ (Data Ops)│ │(RNG Seed)│ │ (Base Class)   │ │  │
│   │  └──────────┘ └──────────┘ └────────────────┘ │  │
│   └────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Layer Dependency

```
Layer 0 (Vendor):     xlsx.full.min.js, fonts.css
Layer 1 (Shared):     lcg.js, pipeline.js, sanitizer.js, export_helper.js
Layer 2 (Core):       algorithm_interface.js, registry.js, state_manager.js, dom_helper.js
Layer 3 (Plugins):    naive_bayes_plugin.js, knn_plugin.js, c45_plugin.js, ...
Layer 4 (UI Shell):   core_ui.js (depends on Layer 0-3)
Layer 5 (Entry):      index.html (loads all layers)
```

---

## Struktur Folder

```
project-root/
├── index.html                 # SPA entry point
├── src/
│   ├── core/                  # Arsitektur inti
│   │   ├── algorithm_interface.js  # Base class AlgorithmPlugin
│   │   ├── registry.js        # Plugin registry (singleton)
│   │   ├── state_manager.js   # Application state manager
│   │   ├── core_ui.js         # SPA shell controller
│   │   └── dom_helper.js      # DOM creation utilities
│   ├── shared/                # Module bersama (main thread & worker)
│   │   ├── pipeline.js        # Data cleaning, splitting, normalization
│   │   ├── lcg.js             # Linear Congruential Generator (seeded RNG)
│   │   ├── sanitizer.js       # XSS & formula injection prevention
│   │   ├── export_helper.js   # Excel export utilities
│   │   ├── generic_worker.js  # Generic Web Worker runtime
│   │   └── worker_factory.js  # Worker lifecycle manager
│   ├── plugins/               # Algorithm plugins (1 folder per algorithm)
│   │   ├── naive_bayes/
│   │   ├── knn/
│   │   ├── c45/
│   │   ├── kmeans/
│   │   ├── regression/
│   │   └── apriori/
│   ├── styles/                # CSS architecture
│   │   ├── main.css           # Entry point (@import all)
│   │   ├── tokens.css         # CSS custom properties
│   │   ├── reset.css          # Base reset
│   │   ├── layout.css         # SPA shell layout
│   │   ├── components.css     # UI components
│   │   ├── forms.css          # Form elements
│   │   ├── tables.css         # Table styles
│   │   └── utilities.css      # Utility classes
│   ├── vendor/                # Third-party (offline)
│   │   ├── xlsx.full.min.js   # SheetJS
│   │   ├── fonts.css          # Font-face declarations
│   │   └── fonts/             # IBM Plex Sans & Mono
│   └── assets/                # Static assets
│       └── logo.ico           # Favicon
├── docs/                      # Documentation
├── PLUGIN_TEMPLATE/           # Template untuk plugin baru
└── Dataset/                   # Sample datasets (testing)
```

---

## Thread Model

| Context | Files Loaded | Purpose |
|---------|-------------|---------|
| **Main Thread** | core_ui.js, registry.js, state_manager.js, dom_helper.js, all plugins | UI rendering, event handling, DOM manipulation |
| **Worker Thread** | generic_worker.js, pipeline.js, lcg.js, algorithm_interface.js, registry.js, active plugin | Heavy computation (process method) |

> **Important**: Worker thread **tidak** memiliki akses ke DOM. Semua rendering dilakukan di main thread setelah Worker mengirim hasil via `postMessage()`.
