# Analytics scope labels (#442, #402 / #389)

The analytics presentation accepts `currentLocationOnly?: boolean`, passed directly from the authenticated server report associated with its displayed metrics. It must never infer this flag from a filter, catalog location or browser permission. Root's workspace adapter owns passing `report?.currentLocationOnly`.

With metrics loaded, the visible **Afdelingshistorik** note explains current-location-only history when true, historical locations within the loaded period when false, and unknown scope when omitted. Unknown never defaults to an all-history claim. Existing incomplete-period/retention/loading warnings remain independent; an all-history scope does not promise a complete sample.

Campaign and placement selectors use the QR codes' current catalog metadata, so both selectors and the summary table are associated with a visible **Aktuelle metadata** note. It explicitly states that these filters and columns do not describe the campaign/placement at scan time. Columns say **Kampagne (aktuel)** and **Placering (aktuel)**. Historical event-snapshot campaign/tag attribution would require a separately reviewed service/query/aggregation change; this UI does not fabricate one.

`tests/unit/qr-analytics-scope-browser.cjs` renders the actual client in Chromium, covering true/false/missing server scope, accessible metadata descriptions on both selectors/table, unchanged requested filter values, and a narrow mobile viewport. The existing analytics browser suite remains a regression check. This is intercepted component QA, not authenticated production acceptance. No analytics service, permission, event schema or production data changes in this slice.
