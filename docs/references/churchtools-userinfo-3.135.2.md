# ChurchTools OAuth user-info response, version 3.135.2

This response was captured on 2026-08-30 from a ChurchTools-hosted installation by completing a real OAuth authorization-code login and requesting `/oauth/userinfo` with the resulting bearer token. The capturing administrator confirmed that `id` and `sub` equal the immutable ChurchTools User ID displayed by the ChurchTools UI.

Personal values, image identifiers, group names, and role names are sanitized. Field names, nesting, duplication, JSON types, and the relationship between fields are preserved from the captured response. This reference may be used when evaluating future profile synchronization, but ElderFlow currently consumes only `id` and `email` and never updates a local User from profile data.

```json
{
  "data": {
    "id": 4711,
    "sub": 4711,
    "firstName": "Ada",
    "lastName": "Example",
    "email": "user@example.com",
    "imageUrl": "https://example.church.tools/images/sanitized-image-id",
    "photoURL": "https://example.church.tools/images/sanitized-image-id",
    "displayName": "Ada Example",
    "userName": "aexample",
    "groups": [
      "Example group 1",
      "Example group 2"
    ],
    "roles": [
      "Example role 1",
      "Example role 2"
    ]
  },
  "id": 4711,
  "sub": 4711,
  "firstName": "Ada",
  "lastName": "Example",
  "email": "user@example.com",
  "imageUrl": "https://example.church.tools/images/sanitized-image-id",
  "photoURL": "https://example.church.tools/images/sanitized-image-id",
  "displayName": "Ada Example",
  "userName": "aexample",
  "groups": [
    "Example group 1",
    "Example group 2"
  ],
  "roles": [
    "Example role 1",
    "Example role 2"
  ]
}
```

The duplicated root and `data` shapes appear to be a compatibility behavior. ElderFlow therefore prefers valid root-level `id` and `email` values and falls back independently to `data.id` and `data.email` if a root value is missing or invalid.
