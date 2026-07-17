# Return language-neutral API errors

The backend will return stable machine-readable error codes and parameters, with English messages retained only as diagnostic and backward-compatible fallbacks. The frontend owns localization of errors, including validation constraints, rather than making the backend select a response language from user preferences or request headers.
