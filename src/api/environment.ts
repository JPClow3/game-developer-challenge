// The challenge runs entirely from fixtures, including published builds.
// The optional Neon backend requires an explicit opt-in at build time.
export const useMockApi = import.meta.env.VITE_USE_MSW !== 'false';
