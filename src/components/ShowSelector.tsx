interface Show {
  name: string;
  path: string;
}

interface ShowSelectorProps {
  shows: Show[];
  onShowSelect: (show: Show) => void;
}

export default function ShowSelector({ shows, onShowSelect }: ShowSelectorProps) {
  // Extract show title and ID from the pattern "Show Name (YYYY) [tvdbid-12345]"
  const parseShowInfo = (showName: string) => {
    let title = showName;
    let year = null;
    let id = null;
    
    // Extract year if exists
    const yearMatch = showName.match(/\((\d{4})\)/);
    if (yearMatch) {
      year = yearMatch[1];
    }
    
    // Extract ID if exists
    const idMatch = showName.match(/\[tvdbid-(\d+)\]/);
    if (idMatch) {
      id = idMatch[1];
    }
    
    // Clean up title by removing the year and ID portions
    title = title.replace(/\(\d{4}\)/, '').replace(/\[tvdbid-\d+\]/, '').trim();
    
    return { title, year, id };
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Shows</h2>
      
      <div className="space-y-3">
        {shows.length === 0 ? (
          <div className="text-gray-500 text-center p-2">No shows found</div>
        ) : (
          shows.map((show) => {
            const { title, year, id } = parseShowInfo(show.name);
            return (
              <div
                key={show.path}
                onClick={() => onShowSelect(show)}
                className="border rounded p-3 hover:bg-gray-50 cursor-pointer"
              >
                <div className="font-medium text-blue-600">{title}</div>
                <div className="flex items-center text-sm text-gray-500 mt-1">
                  {year && <span className="mr-2">{year}</span>}
                  {id && <span className="bg-gray-200 px-1 rounded">ID: {id}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
} 