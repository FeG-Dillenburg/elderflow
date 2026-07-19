# Lock Topic type after its first Meeting appearance

A Topic's type may be corrected only before it has appeared in a Meeting; afterward the type is immutable. Topic type controls behavior and historical presentation, so allowing later changes would rewrite how past Meetings are understood unless every appearance stored a type snapshot; closing the old Topic and creating a new one keeps that history explicit without duplicating type-specific state.
