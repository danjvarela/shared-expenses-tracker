# Identity is a separate entity, keyed by (provider, providerSubject)

Google is the only login provider today, so a flat `googleId` column on `user` would have worked for now. We chose a separate `Identity` entity instead, keyed on (`provider`, `providerSubject`) rather than a Google-specific field, linked to `user` by `userId`. Reasons: it keeps `user` a pure profile record independent of how a User authenticates, it makes the pre-invite-then-login flow (a `User` can exist with no `Identity` yet) an explicit 1:0..1 relationship rather than a nullable column with implicit meaning, and it leaves room for a second provider later without a schema migration to introduce the concept of a provider.

## Considered Options

- Flat `googleId` column on `user` — simpler, but conflates "is a User" with "has authenticated via Google," a nullable unique column is a weaker way to express "may not exist yet," and adding a second provider later would require introducing this same Identity concept anyway.
