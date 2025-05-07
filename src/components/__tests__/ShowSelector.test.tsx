import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ShowSelector from '../ShowSelector';

describe('ShowSelector component', () => {
  it('renders placeholder when no shows are passed', () => {
    render(<ShowSelector shows={[]} onShowSelect={() => {}} />);
    expect(screen.getByText('No shows found')).toBeInTheDocument();
  });

  it('renders show items with title, year, and ID and calls callback on click', () => {
    const shows = [
      { name: 'Test Show (2020) [tvdbid-123]', path: '/test-show' }
    ];
    const onShowSelect = jest.fn();
    render(<ShowSelector shows={shows} onShowSelect={onShowSelect} />);

    expect(screen.getByText('Test Show')).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText('ID: 123')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Test Show'));
    expect(onShowSelect).toHaveBeenCalledWith(shows[0]);
  });
}); 