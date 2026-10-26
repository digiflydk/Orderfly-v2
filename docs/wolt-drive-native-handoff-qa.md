# Native dispatcher and cancellation adapter handoff QA

Issues #682/#683; coordination #657. Independent Wolt adapter-boundary verification, 2026-10-26. This does not implement another worker, datastore or payment path.

`tests/unit/wolt-native-handoff.cjs` executes the real provider facade, transport, native create and cancellation mappers against controlled HTTP and shared-style callback fixtures. Four tests passed:

- A synchronously consumed exact claim permits one create despite concurrent calls and replays. Both delivery ID and native order reference survive the accepted shared result.
- A lost provider response stays unknown, retains the attempt reference and prevents redispatch through the consumed claim. Unsupported lookup does not become confirmed absence or imply refund eligibility.
- The current shared `operatorReason` reaches Wolt unchanged, cancellation addresses the stored native order reference and replay cannot issue a second PATCH.
- A known pickup start blocks before PATCH; a racing native state-transition rejection stays not-cancellable.

The callback fixture models the one-shot contract. This is not proof of the actual Firestore transaction implementation, worker scheduler or authorization. Those tests belong to the delivery coordinator. The Wolt adapter has no payment write dependency.

The local integration candidate moved during review; the tested adapter files were pinned by blob identity:

| File | Blob |
|---|---|
| `src/lib/delivery/provider-contract.ts` | `d2da8a2ec58375463aaa8b39957b5d95b6c3cab2` |
| `src/lib/delivery/providers/wolt/provider.ts` | `eab564e491f4a4ea7ae2f156e1af8e60e1d61435` |
| `src/lib/delivery/providers/wolt/create.ts` | `c2723a813d0f3d94b5696d3a877f463aff3140bc` |
| `src/lib/delivery/providers/wolt/cancel.ts` | `d482de273b015c7dc0434c139d4c3fa1b02e8e83` |
| `src/lib/delivery/providers/wolt/http.ts` | `56a621f517e79ef86bd318d9b5a301d8b0e72e46` |

Run from the assembled repository with `node --test tests/unit/wolt-native-handoff.cjs`. Before the dependent adapters land on main, `WOLT_ADAPTER_SOURCE_ROOT` can identify an isolated assembled source checkout. The override changes only the local source tree being tested; fetch remains a controlled fixture, and no credentials or network calls are used.

Read-only shared-source review found that cancellation's pickup-start projection allowed `courier_to_pickup`, although Wolt `order.pickup_started` maps to that state. The required shared-owner correction and no-PATCH regression were reported in [#657](https://github.com/digiflydk/Orderfly-v2/issues/657#issuecomment-6409773450). No shared source was edited by this test change. Release must verify that correction independently, together with genuine callback, browser and production gates.
