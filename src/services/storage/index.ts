import type { IStorageService } from './IStorageService';
import { LocalStorageService } from './LocalStorageService';

/**
 * Storage Factory
 * Change the implementation here to switch between storage backends
 * 
 * Usage in components:
 * import { storageService } from '@/services/storage';
 */

// Initialize your preferred storage service here
export const storageService: IStorageService = new LocalStorageService();

// When you want to switch to Firebase/Supabase, just change this:
// export const storageService: IStorageService = new FirebaseStorageService();
// export const storageService: IStorageService = new SupabaseStorageService();

export type { IStorageService };
export { LocalStorageService };
