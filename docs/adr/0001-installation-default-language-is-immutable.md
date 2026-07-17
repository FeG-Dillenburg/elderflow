# Keep the installation default language immutable

The installation default language is selected during initial setup and cannot be changed afterward because it also determines the language of system-provided stored content such as the initial agenda section names. Allowing it to change without translating existing stored content would leave an installation with misleading fallback behavior and mixed-language data; a future explicit translation operation may revisit this constraint.
