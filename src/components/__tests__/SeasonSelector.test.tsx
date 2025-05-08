import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SeasonSelector, { Season } from '../SeasonSelector';

describe('SeasonSelector component', () => {
  const seasons: Season[] = [
    { name: 'Season 1', path: '/s1' },
    { name: 'Season 2', path: '/s2' }
  ];

  it('renders nothing when seasons list is empty', () => {
    const onSelect = jest.fn();
    const { container } = render(<SeasonSelector seasons={[]} selectedSeason={null} onSelect={onSelect} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders season items and highlights selected one', () => {
    const onSelect = jest.fn();
    render(<SeasonSelector seasons={seasons} selectedSeason={seasons[0]} onSelect={onSelect} />);

    // Check that both season names render
    expect(screen.getByText('Season 1')).toBeInTheDocument();
    expect(screen.getByText('Season 2')).toBeInTheDocument();

    // Find the outer div container wrapping the season name
    const innerDiv = screen.getByText('Season 1');
    const selectedItem = innerDiv.parentElement;
    expect(selectedItem).toHaveClass('bg-gray-700', 'border-blue-500');
  });

  it('calls onSelect callback when a season is clicked', () => {
    const onSelect = jest.fn();
    render(<SeasonSelector seasons={seasons} selectedSeason={null} onSelect={onSelect} />);

    const season2Item = screen.getByText('Season 2').closest('div');
    fireEvent.click(season2Item!);
    expect(onSelect).toHaveBeenCalledWith(seasons[1]);
  });
}); 