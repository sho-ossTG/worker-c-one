# Server C Website Template

Server: C (yt-dlp worker)
Website URL: https://worker-c-one.vercel.app/

## Ordered sections

1. Status Page Card Header
   - Blueprint reference: `.planning/templates/sections/SECTION-STATUS-PAGE-CARD-HEADER.md`
   - Status: ✅ Functional

2. Health Checks
   - Blueprint reference: `.planning/templates/sections/SECTION-HEALTH-CHECKS.md`
   - Status: ✅ Functional

3. Runtime Stats
   - Blueprint reference: `.planning/templates/sections/SECTION-RUNTIME-STATS.md`
   - Status: ✅ Functional

4. Connections
   - Blueprint reference: `.planning/templates/sections/SECTION-CONNECTIONS.md`
   - Status: ✅ Functional

5. Curl Snippet
   - Blueprint reference: `.planning/templates/sections/SECTION-CURL-SNIPPET.md`
   - Status: 🚧 Non-functional (stub)
   - Activation note: Enable STUB-K-01 in `renderStatusPage()` to render a copy-ready `/api/resolve` curl command.

## Change checklist (template-first rule)

When adding, removing, or changing a website section for this server:

1. update the section blueprint in `.planning/templates/sections/` (or create a new blueprint first).
2. update this file so the ordered section list, blueprint reference, and status markers match the intended website contract.
3. rebuild the server website page so runtime output matches this template exactly.
