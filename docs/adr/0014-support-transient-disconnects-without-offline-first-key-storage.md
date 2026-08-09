# Support transient disconnects without offline-first key storage

The encrypted collaboration design must let an already authenticated and unlocked client continue editing through a temporary network interruption and merge safely after reconnecting. Deliberate long-term offline operation, offline login, and durable offline storage of decryption keys are excluded from the first architecture to avoid expanding the security boundary into a full offline-first client.
