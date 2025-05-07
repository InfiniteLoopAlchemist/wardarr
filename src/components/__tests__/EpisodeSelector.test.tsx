import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EpisodeSelector from '../EpisodeSelector';

describe('EpisodeSelector component', () => {
  it('renders placeholder when no episodes are passed', () => {
    render(<EpisodeSelector episodes={[]} />);
    expect(screen.getByText('No episodes found')).toBeInTheDocument();
  });

  it('groups episodes by season and renders season headers and episodes, then opens player controls on click', () => {
    const episodes = [
      { filename: 'file1.mkv', path: '/season1/file1.mkv', season: 1, episode: 1, name: 'Episode One' },
      { filename: 'file2.mkv', path: '/season2/file2.mkv', season: 2, episode: 2, name: 'Episode Two' }
    ];
    render(<EpisodeSelector episodes={episodes} />);

    // Season headers
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.getByText('Season 2')).toBeInTheDocument();

    // Episodes listed
    expect(screen.getByText('E01')).toBeInTheDocument();
    expect(screen.getByText('E02')).toBeInTheDocument();

    // Click first episode to open player controls
    fireEvent.click(screen.getByText('E01'));
    expect(screen.getByText('Run Clip Matcher')).toBeInTheDocument();
    expect(screen.getByText('Open in New Tab')).toBeInTheDocument();
    expect(screen.getByText('Close Player')).toBeInTheDocument();
  });
}); 