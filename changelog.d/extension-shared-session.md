## Changed

- Share the browser extension's sign-in and replica through the SDK across the side panel, settings, welcome page and background worker, with collection selection owned by each context.
- Keep capture-create follow-through while its originating context remains open; the shared SDK Worker continues owning pending replica writes after that context closes.
