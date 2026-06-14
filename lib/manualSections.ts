export const ADDITIONAL_MANUAL_SECTIONS = [
  'TILING',
  'ELECTRICAL WIRING AND CONNECTONS',
  'CEILING',
  'SKIMING',
  'STEEL WINDOW FRAME AND GLAZING',
  'PAINTING',
  'JOINERY AND IRON MONGARY',
  'PLUMBING',
  'GUTTER',
  'ALUMINIUM WINDOW FRAME',
] as const;

export function normalizeSectionName(section?: string | null): string {
  return (section ?? '').trim().toUpperCase();
}