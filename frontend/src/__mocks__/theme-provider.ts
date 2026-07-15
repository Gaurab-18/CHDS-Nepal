let mockTheme = 'light';
const toggleMock = jest.fn(() => {
  mockTheme = mockTheme === 'light' ? 'dark' : 'light';
});

export const useTheme = () => ({
  theme: mockTheme,
  toggle: toggleMock,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => children;

export const resetTheme = () => {
  mockTheme = 'light';
};
