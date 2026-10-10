const PERSON_NAME_MAX = 120;

const ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} '’.\-]*$/u;

export function personNameProblem(value: string, label = "name"): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0) return `Enter the ${label}.`;
  if (name.length < 2) return `The ${label} must be at least 2 characters.`;
  if (name.length > PERSON_NAME_MAX) return `The ${label} must be ${PERSON_NAME_MAX} characters or fewer.`;
  if (!ALLOWED.test(name) || !/\p{L}.*\p{L}/u.test(name))
    return `Use only letters, spaces, apostrophes, hyphens and periods in the ${label}.`;
  return null;
}
