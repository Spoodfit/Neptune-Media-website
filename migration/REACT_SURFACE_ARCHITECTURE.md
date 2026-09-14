# Neptune Media — React surface architecture

All user-facing Neptune Media surfaces must be implemented in React in the target application architecture. Static HTML/imperative-script pages are compatibility sources only and must not be carried forward as the target UI architecture.

## Canonical rule

The target Media frontend is a React application. Site Media, HORS NORME, reservation, client portal, Studio and direct/WebTV must converge into React routes/components that consume the same backend domain services.

The HORS NORME landing is the first Cloudflare reference surface moved to a source-controlled React build. Its source is `neptune-tv-media-cloudflare/react/hors-norme/`; `public/hors-norme/` is generated at build time and is not an editable source directory.

## Target monorepo

The definitive VPS implementation remains `Neptune-main/apps/media` for the frontend and `Neptune-main/apps/backend` for Express/Prisma/PostgreSQL. The React migration must preserve business behavior while replacing legacy DOM injection and page-specific imperative ownership with React components and explicit state/data flows.

## Surface migration order

1. HORS NORME — React source is canonical now.
2. Reservation — converge the existing React reservation implementation with the reference Worker contracts.
3. Site Media — converge the existing React landing implementation with the reference public site.
4. Client portal — replace legacy HTML/JS screens with React routes and components.
5. Studio — replace legacy HTML/JS cockpit screens with React routes and components while preserving operational behavior.
6. Direct/WebTV — replace legacy monitor/control UI with React while keeping streaming/control services backend-owned.

## Non-negotiable constraints

- Pricing, capacity, slot availability, holds, Stripe authority and order state stay backend-owned.
- React is the only target UI architecture; no new legacy HTML/DOM-injection surface may be introduced.
- Generated frontend output is never a source of truth.
- The Cloudflare reference runtime may retain compatibility wrappers until VPS parity is proven, but those wrappers are not copied into the React target architecture.
