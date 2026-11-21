# Product preview commerce and analytics

Research services and their data are not changed by these integrations.

## Automatic collection mode requested on 21 November 2026

SCENTSELF_ADVISOR_ANALYTICS_MODE=automatic_notice removes the initial permission
question and collects GA4 data on first visit, with a persistent disclosure and
statistics controls. This is collection before consent, NOT a consent
management or legal compliance solution. Notice or an opt-out is not equivalent
to consent. Before enabling this mode for visitors, the operator must establish
a lawful basis, satisfy applicable regional requirements and Google's terms,
and provide the required privacy information. In jurisdictions requiring prior
consent, use opt_in instead; this application does not perform geolocation or
region-specific legal checks.

The service does not write a user-consent record or send analytics consent as
granted merely because automatic mode is active. Analytics cookies can still be
set by GA4. Ads consent remains denied; Google signals/personalization remain
disabled. Prior denials, Global Privacy Control and Do Not Track are respected.
Turning collection off stops further events and clears GA cookies. It does not
delete already received data in Google Analytics. The opt_in behavior below
remains the default when the mode is unset or invalid.

## Shopping links

advisor_commerce.py holds exact brand/name matches for product pages checked
on 21 November 2026. Four editions currently have product links. Other editions
open an explicitly labelled Google search; those sellers are not verified.
No affiliate relationships, commission parameters, checkout, or cart exist.
International brand pages may not ship to Thailand. Users must check region,
edition, size, current price, seller, and shipping on the destination.
Links never influence recommendation ranking.

## Activate a separate GA4 property

1. Create a GA4 Web data stream for the public product-preview URL, not the
   closed research URL. Use Asia/Bangkok and THB.
2. Disable Enhanced Measurement for this stream before enabling it. In
   particular, do not enable form interactions, site search, outbound-link
   auto-collection, or user-provided data collection. The preview emits its own
   allowlisted events instead of transmitting form values or outbound URLs.
3. Set SCENTSELF_ADVISOR_GA4_ID=G-... in the product service environment or in
   the local .env. Restart only the product service. This ID is public and is
   not a Google password, API key, or research admin token.
4. Until a valid ID is configured, analytics is entirely inactive. Even when
   configured, the Google tag is blocked until consent is granted. Refusing
   analytics does not block recommendations or shopping links.
5. Use GA4 Realtime or DebugView to verify your actual property before launch.
   The initial release left analytics inactive. On 21 November 2026 the user
   supplied G-C54LLBYMB5, which was configured on the product service only.
   A fresh-browser test confirmed Google collection endpoint responses for
   page_view, view_item_list, select_item, and shop_click after consent, no
   Google tag before consent, and disabled collection plus deleted GA cookies
   after revocation. Test events were marked debug_mode. Dashboard processing
   and the Reports UI were not inspected; the property owner should verify
   Realtime or DebugView.

Events:

- advisor_start: new or owned mode only.
- view_item_list: recommendation response rendered; product IDs only. It is
  not proof that every item was visible on screen or read.
- select_item: user selects a bottle to try/use.
- similar_request: user requests similar bottles.
- shop_click: outbound click, with product ID and product/search link type.

No chat text, typed budget, outfit image, survey answers, participant ID, raw
outbound URL, or location query parameters are supplied by these custom events.
Google still receives ordinary browser/network metadata and uses analytics
cookies when consent is granted. Consent can be changed using the statistics
button; denying stops further events and removes first-party GA cookies.
Revocation does not delete previously collected GA data.

shop_click measures referral interest, not a purchase. Do not emit purchase,
add_to_cart, or revenue unless an authorized merchant conversion integration
later provides verified transactions. GA4 cannot reconstruct historical A/B
responses and is not a backup for the research database.

References:

- https://developers.google.com/tag-platform/security/guides/consent
- https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
- https://support.google.com/analytics/answer/9304153
- https://support.google.com/analytics/answer/6004245
