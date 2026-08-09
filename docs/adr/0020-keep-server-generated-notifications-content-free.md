# Keep server-generated notifications content-free

Reliable server-generated notifications may use server-readable metadata such as counts, dates, record types, and links, but they must not include Protected text. Passing client-decrypted content through the backend or an ordinary email provider would leave the E2EE boundary even if logging were disabled; content-bearing email, encrypted email, and server-blind encrypted push are deferred to separate future efforts.
