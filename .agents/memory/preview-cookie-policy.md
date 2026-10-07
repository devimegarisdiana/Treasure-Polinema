---
name: Development preview cookie rewriting
description: Distinguishes app cookie policy from HTTPS preview proxy transformations.
---

The HTTPS development preview can rewrite a cookie's `SameSite=Lax` attribute to `SameSite=None`. Do not diagnose this browser-visible attribute alone as an application bug.

**Why:** Native participant-auth testing observed `None` in the browser, while the same sign-out response retained `Lax` through both the direct API and local preview proxy. Only the HTTPS development proxy changed the attribute and added `Secure`.

**How to apply:** Compare direct API and HTTPS preview response headers before changing cookie configuration. Retain HttpOnly, secure HTTPS cookies, and explicit same-origin/cross-site request checks; do not rely on SameSite alone for CSRF protection. Verify production behavior separately instead of assuming it matches the development proxy.
