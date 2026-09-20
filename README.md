<div align="center">

<img src="./src-tauri/icons/128x128@2x.png" alt="MasterSafe" width="190">

# MasterSafe

### Your personal documents, encrypted, organized, and always under your control.

**MasterSafe is a secure personal document vault for Windows and Android, built to store, organize, encrypt, synchronize, and intelligently search important documents.**

It combines local-first privacy, encrypted cloud sync, deadline tracking, OCR, recovery tools, and optional AI assistance in a single desktop and mobile experience.

</div>

> **Status:** Beta  
> **Current version:** 7.7.0

---

## Overview

MasterSafe was designed around a simple idea: personal documents should be easy to find without giving up control over them.

The application keeps a protected local vault on the device and can optionally synchronize encrypted data through the cloud. Users can organize documents, track expiration dates, extract text from scanned files, restore their vault on another device, and use the **Ask the Vault** assistant to search their own content.

The local vault remains usable even when cloud or AI services are unavailable.

---

## Main features

- **Encrypted personal vault** with client-side protection
- **Local-first storage** for documents and metadata
- **Optional encrypted cloud synchronization**
- **Elastic cloud quota** with capacity protection
- **Windows desktop application**
- **Android application**
- Organization by **categories, tags, issuer, dates, and document type**
- **Expiration radar** for documents that need attention
- **PDF text extraction** with PDF.js
- **Local OCR** for images and scanned PDFs with Tesseract.js
- **Smart document reading** and metadata suggestions
- **Ask the Vault** search assistant
- Optional **Groq-powered AI** through a protected Supabase Edge Function
- Sensitive-data masking before selected text is sent to online AI
- **Account authentication**
- **2FA support**
- **Passkeys**
- **Vault recovery code**
- **Encrypted backup and restore**
- Portable data export
- Automated Windows and Android builds with GitHub Actions

---

## Security model

MasterSafe is designed so that documents are protected **before cloud synchronization**.

The account password and the vault master password serve different purposes:

- the **account password** authenticates the user with the online service;
- the **master password** protects access to the cryptographic vault.

Files synchronized to the cloud are uploaded in encrypted form.

The optional online AI feature does **not** receive the original document file. MasterSafe selects relevant text, masks supported sensitive data patterns, and sends only the required context through a Supabase Edge Function.

The Groq API key is stored as a **Supabase secret** and is never bundled inside the Windows executable or Android APK.

For the technical security and architecture overview, see [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

---

## How MasterSafe works

~~~mermaid
flowchart LR
    A[Windows / Android] --> B[Local encrypted vault]
    B --> C[OCR & PDF processing]
    B --> D[Encrypted sync]
    D --> E[Supabase]
    B --> F[Ask the Vault]
    F --> G[Local search]
    F --> H[Optional online AI]
    H --> I[Supabase Edge Function]
    I --> J[Groq]
~~~

The local vault is the center of the application. Cloud synchronization and online AI are optional layers around it.

---

## Cloud and AI

### Supabase

MasterSafe uses Supabase for online features such as:

- authentication;
- database records;
- encrypted file storage;
- synchronization;
- Edge Functions;
- account security features.

### Groq

Groq is used only when the optional online AI mode is enabled.

The AI feature is designed as a complement to local search, not as a dependency. If the online AI service is unavailable or reaches its usage limit, MasterSafe can continue operating with its local features.

### Cloudflare

Cloudflare is used for lightweight web publication and infrastructure where applicable.

---

## Project structure

~~~text
MasterSafe/
├── .github/
│   └── workflows/
│       └── build-installers.yml
├── docs/
│   └── ARQUITETURA.md
├── src-tauri/
│   ├── src/
│   ├── icons/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── supabase/
│   └── functions/
├── web/
│   ├── index.html
│   ├── app.js
│   ├── smart.js
│   ├── cloud.js
│   ├── quota.js
│   ├── ai.js
│   ├── styles.css
│   └── assets/
├── package.json
└── README.md
~~~

### Important files

| File | Purpose |
|---|---|
| **web/index.html** | Main application interface |
| **web/app.js** | Vault and document workflow |
| **web/smart.js** | OCR, PDF reading, and smart processing |
| **web/cloud.js** | Authentication and synchronization |
| **web/quota.js** | Dynamic cloud quota logic |
| **web/ai.js** | Optional AI integration |
| **web/styles.css** | Main visual system |
| **src-tauri/** | Native Windows and Android shell |
| **supabase/** | Backend functions and Supabase resources |
| **docs/ARQUITETURA.md** | Technical architecture documentation |
| **.github/workflows/build-installers.yml** | Automated installers pipeline |

---

## Technology stack

**Application**
- Tauri 2
- Rust
- JavaScript
- HTML
- CSS

**Security and local processing**
- Web Crypto API
- IndexedDB
- PDF.js
- Tesseract.js

**Cloud**
- Supabase Auth
- Supabase Database
- Supabase Storage
- Supabase Edge Functions
- Cloudflare

**AI**
- Groq API

**Automation**
- GitHub Actions

---

## Download

Pre-built beta installers are published through GitHub Releases.

### Windows

Download **MasterSafe-Windows-Setup.exe**, run the installer, and open MasterSafe normally from Windows.

### Android

Download **MasterSafe-Android.apk** and allow APK installation from the downloaded file when Android requests permission.

**Beta release:**  
https://github.com/brunoalves-io/MasterSafe/releases/tag/beta-latest

---

## Build from source

### Requirements

For desktop development:

- Node.js
- Rust
- Tauri prerequisites for your operating system

Install the project dependencies:

~~~bash
npm install
~~~

Run the desktop development version:

~~~bash
npm run desktop:dev
~~~

Build the Windows application:

~~~bash
npm run desktop:build
~~~

Android builds are also supported through the Tauri Android toolchain.

---

## Automated builds

The repository includes the **Build MasterSafe Installers** GitHub Actions workflow.

Changes to the main application can trigger automated builds for:

- **MasterSafe-Windows-Setup.exe**
- **MasterSafe-Android.apk**

Successful artifacts are published to the **MasterSafe Beta** release.

---

## Product principles

MasterSafe is being developed around four principles:

1. **Privacy first**  
   Personal documents should remain under the user's control.

2. **Local-first resilience**  
   Core vault features should continue working without depending on an online service.

3. **Simple security**  
   Strong protection should not turn everyday document management into a maze.

4. **Portability**  
   Users should be able to back up, restore, export, and move their own data.

---

## Development status

MasterSafe is currently in **Beta**.

The project is under active development and interfaces, quotas, online features, packaging, and product rules may change before a stable release.

Do not treat the beta as the only copy of irreplaceable documents. Keep independent backups of critical files.

---

## Documentation

- [Architecture](docs/ARQUITETURA.md)
- [Privacy Policy](web/privacidade.html)
- [Terms of Use](web/termos.html)

---

## Author

**AB Alves**

MasterSafe is an independent project focused on private, practical, and accessible personal document management.
