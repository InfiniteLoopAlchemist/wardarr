import '@testing-library/jest-dom'; 

// Silence console.log in tests
jest.spyOn(console, 'log').mockImplementation(() => {});

// Silence console.error in tests
jest.spyOn(console, 'error').mockImplementation(() => {}); 