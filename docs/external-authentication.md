# External authentication

ElderFlow can use one installation-wide OpenID Connect or ChurchTools External login provider. The provider validates an identity only: ElderFlow still creates and manages every User, role, Local password, 12-hour session, and Protected-text unlock independently.

Superadmins and IT admins configure the provider under **Settings → Authentication**. Save the provider as a draft, copy the displayed callback URL into the provider, complete a real test login, and then enable it explicitly. The login page presents External login first while retaining the complete Local login form.

Provider tests report one localized result and distinguish discovery, token, signing-key, and user-info failures. Network diagnostics identify safe categories such as DNS, TLS, connection, timeout, invalid response, and oversized response. The transaction-correlated backend warning includes the request stage and method, the endpoint without credentials or query parameters, the HTTP status when available, and the first resolved IP address/family plus safe Node.js network code for connection failures. It never includes authorization codes, tokens, form or response bodies, headers, query parameters, or secrets. Returning from a provider test prepares Protected-text unlocking but does not open the unlock dialog automatically.

## Public URL and callback registration

Set **Public ElderFlow URL** to the canonical URL users open in their browsers, for example `https://elderflow.example.org`. This value must describe the reverse-proxy-facing origin; ElderFlow does not trust request `Host` or forwarded-host headers for OAuth redirects.

The settings page derives the exact callback URL:

```text
https://elderflow.example.org/api/auth/external/callback
```

Register that exact URL with the provider. Production URLs require HTTPS. Localhost HTTP is accepted only in development and test.

For local testing, start the complete development environment with `pnpm dev` and use the printed frontend URL as the Public ElderFlow URL. Vite proxies `/api` HTTP and WebSocket traffic to the dynamically selected backend port, so the OAuth callback and the completion page share the frontend origin. ChurchTools only redirects the user's browser to the callback; it does not need direct server-to-server access to the local ElderFlow instance.

The production image has the same same-origin layout without a development proxy. NestJS serves the compiled Vue application and the API from the container's port `8080`, while the deployment reverse proxy exposes that single origin and terminates TLS. Consequently, ElderFlow does not enable cross-origin API access in either environment.

## OpenID Connect

Enter a display label, issuer URL, client ID, optional client secret, and Public ElderFlow URL. ElderFlow uses discovery and Authorization Code flow with PKCE S256, state, nonce, and fixed `openid email` scopes. It validates token signatures, issuer, audience, times, nonce, subject, and verified email. It does not request offline access or retain provider tokens.

If a client secret is used, configure `AUTH_PROVIDER_SECRETS_KEY` with a stable, random 32-byte base64url value. Generate one outside the application deployment and store it in the deployment secret manager. This key must be independent from `AUTH_SESSION_SECRET` and all Protected-text keys. Keep the same value when restoring a database backup.

A missing or wrong key does not prevent startup or Local login. A provider that needs the unreadable secret is hidden from the public login page and Authentication Settings shows a restricted diagnostic. Providers without a client secret remain usable.

## ChurchTools

Enter a display label, the ChurchTools installation URL, the OAuth client identifier created in ChurchTools, and the Public ElderFlow URL. Do not configure a scope or client secret. ChurchTools users need its “Login to External System” permission.

The adapter follows the ChurchTools contract: `/oauth/authorize`, `/oauth/access_token`, and `/oauth/userinfo`; user-info `id` is the stable identity and `email` is the authoritative email. Support was verified against ChurchTools 3.135.2 using a real, sanitized contract capture on 2026-08-30. ChurchTools duplicated the profile fields at the response root and under `data`; ElderFlow reads the root first and uses `data` as a compatibility fallback. See [the captured response reference](references/churchtools-userinfo-3.135.2.md). If either identity value is absent from both locations, ElderFlow rejects the login rather than using email as a lasting identity.

## Linking and maintenance

The first successful login matches exactly one active ElderFlow User by trimmed, case-insensitive email and stores the provider's stable subject. It never creates a User or changes email, name, language, role, or Local password. Later logins use only the stable provider identity, so a provider-side email change cannot move the link.

Authentication Settings lists active Users as linked or unlinked. Resetting one link affects only the next External login; it does not revoke current ElderFlow sessions or alter Local login.

Disabling affects only future External logins. Removing a provider deletes its usable configuration and encrypted credential, deactivates links, and retains the historical provider namespace so old subjects cannot be silently reused. Reconfiguration creates a new namespace and requires a new successful test and first-login email links.

External login callbacks contain only a short-lived one-time completion code. The ElderFlow bearer token is returned by a subsequent same-origin API exchange and never placed in redirect URLs. Login transaction state is stored in PostgreSQL, is single-use, and is cleaned up opportunistically after expiry or consumption.
