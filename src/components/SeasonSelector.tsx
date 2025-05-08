import React from 'react';

export interface Season {
  name: string;
  path: string;
}

interface SeasonSelectorProps {
  seasons: Season[];
  selectedSeason: Season | null;
  onSelect: (season: Season) => void;
}

export default function SeasonSelector({ seasons, selectedSeason, onSelect }: SeasonSelectorProps) {
  if (!seasons || seasons.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg mt-8">
      <h2 className="text-xl font-semibold mb-4">Seasons</h2>
      <div className="space-y-3">
        {seasons.map((season) => (
          <div
            key={season.path}
            onClick={() => onSelect(season)}
            className={`border border-gray-700 rounded p-3 hover:bg-gray-700 cursor-pointer ${
              selectedSeason?.path === season.path ? 'bg-gray-700 border-blue-500' : ''
            }`}
          >
            <div className="font-medium">{season.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
} 