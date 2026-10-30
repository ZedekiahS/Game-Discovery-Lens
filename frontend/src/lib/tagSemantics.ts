import families from '../../../catalog/tag-families.json';

const tagFamilies: Readonly<Record<string, readonly string[]>> = families;

/** A broad choice includes its narrower tags; the reverse is not implied. */
export function matchesTag(tags: readonly string[], choice: string): boolean {
  return (tagFamilies[choice] ?? [choice]).some(tag => tags.includes(tag));
}

export function availableTagChoices(tags: readonly string[]): string[] {
  return [...new Set([...tags, ...Object.keys(tagFamilies).filter(choice => matchesTag(tags, choice))])].sort();
}

/** Required Co-op + excluded Multiplayer conflicts; the inverse can still match PvP games. */
export function conflictsWithExclusions(required: string, excluded: readonly string[]): boolean {
  return excluded.some(choice => matchesTag([required], choice));
}
