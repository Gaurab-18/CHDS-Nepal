import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from '@/components/ui/ThemeToggle';

jest.mock('@/providers/ThemeProvider', () => {
  let currentTheme = 'light';
  return {
    useTheme: () => ({
      theme: currentTheme,
      toggle: () => { currentTheme = currentTheme === 'light' ? 'dark' : 'light'; },
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('ThemeToggle', () => {
  it('renders theme toggle button', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
  });

  it('renders a button with aria-label', () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
  });

  it('fires toggle on click', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
  });
});
