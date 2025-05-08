/**
 * Returns CSS classes for a season card when it is selected.
 * @param isSelected - Whether the season is selected
 */
export function getSeasonCardClass(isSelected: boolean): string {
  return isSelected ? 'bg-gray-700 border-blue-500' : '';
} 