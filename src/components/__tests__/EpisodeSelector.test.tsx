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

describe('EpisodeSelector additional branches', () => {
  beforeEach(() => {
    // Reset global fetch and window.open before each test
    (global.fetch as jest.Mock) = jest.fn();
    window.open = jest.fn();
  });

  it('displays parsed info when episode number is zero', () => {
    const episodes = [
      { filename: 'show_S03E05.mkv', path: '/season3/ep5.mkv', season: 3, episode: 0, name: '' }
    ];
    render(<EpisodeSelector episodes={episodes} />);
    // Should show E05 via parseEpisodeInfo fallback
    expect(screen.getByText('E05')).toBeInTheDocument();
  });

  it('closes player on Close Player click', () => {
    const episodes = [
      { filename: 'file1.mkv', path: '/s1/f1.mkv', season: 1, episode: 1, name: 'Ep1' }
    ];
    render(<EpisodeSelector episodes={episodes} />);
    fireEvent.click(screen.getByText('E01'));
    expect(screen.getByText('Close Player')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Player'));
    // Player controls should no longer be in document
    expect(screen.queryByText('Close Player')).toBeNull();
  });

  it('calls window.open with correct URL on Open in New Tab', () => {
    const ep = { filename: 'fileX', path: '/path/to/fileX.mkv', season: 1, episode: 1, name: 'X' };
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Open in New Tab'));
    expect(window.open).toHaveBeenCalledWith(
      `http://localhost:5000/api/stream?path=${encodeURIComponent(ep.path)}`,
      '_blank'
    );
  });

  it('handles runClipMatcher success and displays images', async () => {
    const ep = { filename: 'f', path: '/p', season: 1, episode: 1, name: '' };
    const data = { success: true, verificationPath: '/ver/abc', matchScore: 0.8 };
    // Mock fetch to return success data
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => data
    });
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Run Clip Matcher'));
    // Wait for matchResult to appear
    const heading = await screen.findByText('Matching Results');
    expect(heading).toBeInTheDocument();
    // Should display image
    const img = screen.getByAltText('Match 1');
    expect(img).toHaveAttribute('src', 'http://localhost:5000/verification/abc/best_match.jpg');
  });

  it('handles runClipMatcher error status and displays message', async () => {
    const ep = { filename: 'f2', path: '/p2', season: 1, episode: 1, name: '' };
    const data = { success: false, error: 'match failed' };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => data });
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Run Clip Matcher'));
    const error = await screen.findByText('match failed');
    expect(error).toBeInTheDocument();
  });

  it('handles runClipMatcher network error', async () => {
    const ep = { filename: 'f3', path: '/p3', season: 1, episode: 1, name: '' };
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network'));  
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Run Clip Matcher'));
    const error = await screen.findByText('Failed to run clip matcher');
    expect(error).toBeInTheDocument();
  });

  it('handles HTTP error response and displays message', async () => {
    const ep = { filename: 'f4', path: '/p4', season: 1, episode: 1, name: '' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'server error' }) });
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Run Clip Matcher'));
    const errorMsg = await screen.findByText('server error');
    expect(errorMsg).toBeInTheDocument();
  });

  it('handles success with no verificationPath and displays score message', async () => {
    const ep = { filename: 'f5', path: '/p5', season: 1, episode: 1, name: '' };
    const data = { success: true, verificationPath: '', matchScore: 1.23 };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => data });
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Run Clip Matcher'));
    const msg = await screen.findByText('Match score: 1.23');
    expect(msg).toBeInTheDocument();
  });

  it('displays filename itself when regex parseEpisodeInfo does not match', () => {
    const ep = { filename: 'random-file.mkv', path: '/r1', season: 1, episode: 0, name: '' };
    render(<EpisodeSelector episodes={[ep]} />);
    // Should display filename in both title and subtitle
    const items = screen.getAllByText('random-file.mkv');
    expect(items).toHaveLength(2);
  });

  it('displays Unknown when filename is empty', () => {
    const ep = { filename: '', path: '/r2', season: 1, episode: 0, name: '' };
    render(<EpisodeSelector episodes={[ep]} />);
    // Should display 'Unknown' for empty filename
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

// Tests for fallback branches in EpisodeSelector
describe('EpisodeSelector grouping fallback scenarios', () => {
  it('groups unknown season and sorts seasons with unknown last', () => {
    const episodes = [
      { filename: 'f1', path: '/p1', season: 1, episode: 1, name: '' },
      { filename: 'f2', path: '/p2', season: undefined as any, episode: 1, name: '' }
    ];
    render(<EpisodeSelector episodes={episodes as any} />);
    // Should render headers in order: Season 1 then Season Unknown
    const headers = screen.getAllByText(/Season/).map(el => el.textContent);
    expect(headers).toEqual(['Season 1', 'Season Unknown']);
  });

  it('covers a===Unknown branch when unknown season first', () => {
    const episodes = [
      { filename: 'f2', path: '/p2', season: undefined as any, episode: 1, name: '' },
      { filename: 'f1', path: '/p1', season: 1, episode: 1, name: '' }
    ];
    render(<EpisodeSelector episodes={episodes as any} />);
    const headers = screen.getAllByText(/Season/).map(el => el.textContent);
    expect(headers).toEqual(['Season 1', 'Season Unknown']);
  });
});

describe('EpisodeSelector matcher fallback error message', () => {
  it('displays Unknown error when HTTP error response with no message field', async () => {
    const ep = { filename: 'fa', path: '/pa', season: 1, episode: 1, name: '' };
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    render(<EpisodeSelector episodes={[ep]} />);
    fireEvent.click(screen.getByText('E01'));
    fireEvent.click(screen.getByText('Run Clip Matcher'));
    const msg = await screen.findByText('Unknown error');
    expect(msg).toBeInTheDocument();
  });
});

// Test runClipMatcherFn early-return branch
import { runClipMatcherFn } from '../EpisodeSelector';
describe('runClipMatcherFn early-return', () => {
  it('does nothing when selectedEpisode is null', async () => {
    const setIsRunning = jest.fn();
    const setMatchResult = jest.fn();
    await runClipMatcherFn(null, setIsRunning, setMatchResult);
    expect(setIsRunning).not.toHaveBeenCalled();
    expect(setMatchResult).not.toHaveBeenCalled();
  });
});

// Tests for compareSeasons utility
import { compareSeasons } from '../EpisodeSelector';
describe('compareSeasons utility function', () => {
  it('places Unknown season last when a is Unknown', () => {
    expect(compareSeasons('Unknown', '2')).toBe(1);
  });
  it('places Unknown season last when b is Unknown', () => {
    expect(compareSeasons('2', 'Unknown')).toBe(-1);
  });
  it('sorts numeric seasons by numeric value when neither is Unknown', () => {
    expect(compareSeasons('10', '3')).toBe(7);
    expect(compareSeasons('3', '10')).toBe(-7);
    expect(compareSeasons('5', '5')).toBe(0);
  });
}); 