# Keep Protected-text unlock independent from authentication

Unlocking Protected text must remain cryptographically and visibly separate from account authentication. The key design may explore shared or per-user envelopes, but it cannot derive from or require a locally stored login password because ElderFlow must remain compatible with future OAuth2/OpenID Connect authentication where the installation never receives the user's identity-provider password.
