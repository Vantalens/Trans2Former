# Trans2Former Repository Threat Model

## Overview

Trans2Former is a local-first browser and Tauri desktop document converter. Static JavaScript under `public/` is served by a loopback Express server or packaged into Tauri. Untrusted documents are parsed locally by format readers, ZIP/OOXML and PDF code, OCR/WASM/ONNX pipelines, previews and Web Workers. IndexedDB and opt-in localStorage cross sessions. Vendor/release scripts are privileged supply-chain surfaces.

## Threat Model, Trust Boundaries, and Assumptions

- Assets: confidentiality and integrity of document content, filenames, outputs, diagnostics and model caches; availability of the browser/desktop process; integrity of shipped assets; the local-only promise.
- Untrusted inputs: uploaded files, archive names/sizes/offsets, XML/HTML/Markdown, PDF objects/streams, image dimensions, imported model/tessdata bytes and persisted document-derived state.
- Browser boundary: hostile bytes cross File/Blob APIs into main-thread or Worker parsers; DOM, preview frames, generated files and output-directory handles are privileged sinks.
- Parser boundary: ZIP, OOXML, EPUB, OFD, PDF, XML, HTML, CSV, JSON and DOC readers must bound sizes, recursion, collections, offsets, encodings and decompression.
- Network boundary: conversion must not upload content. Fetch/WebSocket/beacon, URL-bearing elements, frames, fonts, workers and model loaders must stay within intended local/build-time sources.
- Persistence boundary: model caches and opt-in history must require integrity/consent and avoid cross-document leakage.
- Desktop boundary: current Tauri permissions are limited to `core:default`; filesystem, shell, HTTP or custom IPC would materially increase impact.
- A victim opening an attacker-supplied document is in scope. Accounts, tenants, CSRF and server-side document APIs are out of scope because they do not exist.

Security invariants:

1. No document data or diagnostics leave the device without an explicit new consent boundary.
2. Document-derived content remains inert in DOM, URLs, previews and generated formats.
3. Parsers and OCR enforce input, output, entry, recursion, dimension, collection, allocation and time budgets.
4. Archive paths cannot escape logical containers and declared sizes/offsets cannot drive unsafe reads or allocation.
5. Imported/downloaded model assets are verified before activation; failed vendor gates leave no partial shippable state.
6. Workers, OCR sessions, Blob URLs, timers, documents and caches are released on success, error, cancellation and timeout.

## Attack Surface, Mitigations, and Attacker Stories

- Document readers/writers: archive traversal, bombs, malformed metadata, entity/parser confusion, formula/markup injection and output corruption. Existing controls include path checks, ZIP budgets and structured errors.
- DOM/preview: `innerHTML`, links, iframe blobs and image attributes. CSPs restrict connections and objects, but URL validation and contextual escaping remain necessary.
- OCR/models: hostile dimensions, inference/session exhaustion and untrusted model activation. Digests, manifests, bounds and cleanup are expected controls.
- Workers/persistence: cancellation races, stale results, buffer copies and silent persistence. Message IDs, termination, opt-in history and clear controls mitigate risk.
- Loopback server: static exposure, host override, CSP/header regression and timeout exhaustion. Default binding is `127.0.0.1` with static assets and health only.
- Tauri: XSS impact is constrained by minimal capabilities and CSP.
- Vendor/release scripts: compromised sources, missing digest checks or fail-open partial output can poison releases.

Realistic attackers send crafted documents or convince a user to import model data. Public-server, account takeover and pre-existing native filesystem/shell permissions are not realistic at this commit.

## Severity Calibration (Critical, High, Medium, Low)

- Critical: reliable code/native execution from default document input, release-wide supply-chain compromise, or silent arbitrary document upload.
- High: reliable application-origin script execution with meaningful local data access, arbitrary local file impact through a native capability, or catastrophic low-cost resource exhaustion.
- Medium: reachable parser/OCR denial of service, optional model integrity bypass, CSP-constrained active content or concrete output-integrity loss.
- Low: defense-in-depth gaps, narrowly bounded local DoS, opt-in persistence weaknesses or documentation drift without a broken runtime control.
