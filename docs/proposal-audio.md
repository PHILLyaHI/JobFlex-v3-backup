# Proposal audio — retired

The owner removed the proposal listening feature on September 24, 2026.
Do not restore the client player, contractor Listen actions, email promotion,
or speech generation. The former audio endpoints return HTTP 410 for stale clients.

Existing database fields and stored audio are retained; removing this feature
does not run a migration or delete customer records.
