import type { IStorageService } from './IStorageService';
import { LocalStorageService } from './LocalStorageService';
import { GitHubStorageService } from './GitHubStorageService';

/**
 * Default (fallback) storage – used as placeholder before auth resolves.
 * The AuthContext swaps in a GitHubStorageService once the user is known.
 */
export const storageService: IStorageService = new LocalStorageService();

export type { IStorageService };
export { LocalStorageService, GitHubStorageService };
