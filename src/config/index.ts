/**
 * Application configuration
 * Add your API keys, endpoints, and other config here
 */

export const config = {
  app: {
    name: 'DevNotes',
    version: '1.0.0',
  },
  storage: {
    type: 'localStorage', // Can be: 'localStorage', 'firebase', 'supabase', etc.
  },
  // Add Firebase config when needed
  // firebase: {
  //   apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  //   authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  //   projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  //   // ...
  // },
  // Add Supabase config when needed
  // supabase: {
  //   url: import.meta.env.VITE_SUPABASE_URL,
  //   anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  // },
} as const;
