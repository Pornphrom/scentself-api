# Product preview commerce and analytics

Research services and their data are not changed by these integrations.

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
   No actual property has been connected or verified by this change.

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
