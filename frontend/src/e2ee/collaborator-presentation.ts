export interface CollaboratorPresentation {
  id: string;
  name: string;
  initials: string;
  color: string;
  imageUrl?: string;
}

interface CollaboratorName {
  id: string;
  firstName: string;
  lastName: string;
  imageUrl?: string;
}

const hashName = (name: string): number => {
  let hash = 2_166_136_261;
  for (const character of name) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619);
  }
  return hash >>> 0;
};

const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const secondary = chroma * (1 - Math.abs(segment % 2 - 1));
  const [red, green, blue] = segment < 1
    ? [chroma, secondary, 0]
    : segment < 2
      ? [secondary, chroma, 0]
      : segment < 3
        ? [0, chroma, secondary]
        : segment < 4
          ? [0, secondary, chroma]
          : segment < 5
            ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0"))
    .join("")}`;
};

const firstCharacter = (value: string): string => Array.from(value.trim())[0] ?? "";

export const createCollaboratorPresentation = (
  collaborator: CollaboratorName,
): CollaboratorPresentation => {
  const firstName = collaborator.firstName.trim();
  const lastName = collaborator.lastName.trim();
  const name = [firstName, lastName].filter(Boolean).join(" ");
  const normalizedName = name.normalize("NFKC").toLowerCase();
  const hash = hashName(normalizedName);
  const hue = hash % 360;
  const saturation = 0.6 + ((hash >>> 9) % 15) / 100;
  const lightness = 0.25 + ((hash >>> 17) % 3) / 100;

  return {
    id: collaborator.id,
    name,
    initials: `${firstCharacter(firstName)}${firstCharacter(lastName)}`.toUpperCase(),
    color: hslToHex(hue, saturation, lightness),
    ...(collaborator.imageUrl ? { imageUrl: collaborator.imageUrl } : {}),
  };
};

export const isCollaboratorPresentation = (
  value: unknown,
): value is CollaboratorPresentation => {
  if (!value || typeof value !== "object") return false;
  const collaborator = value as Record<string, unknown>;
  return typeof collaborator.id === "string"
    && collaborator.id.length <= 100
    && typeof collaborator.name === "string"
    && collaborator.name.length <= 201
    && typeof collaborator.initials === "string"
    && collaborator.initials.length > 0
    && collaborator.initials.length <= 4
    && typeof collaborator.color === "string"
    && /^#[0-9a-f]{6}$/i.test(collaborator.color)
    && (collaborator.imageUrl === undefined
      || (typeof collaborator.imageUrl === "string"
        && collaborator.imageUrl.length <= 2_048
        && /^\/(?!\/)/.test(collaborator.imageUrl)));
};
