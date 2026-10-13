import { getReelsForYou } from './forYouService';
import type { ForYouHandlerOk, ForYouQuery } from './types';

/**
 * GET /api/reels/for-you?cursor=&limit=
 * Statik export Next.js route-u dəstəkləmir; eyni handler klientdən çağırılır.
 */
export async function handleForYouGet(
  authUserId: string,
  searchParams: URLSearchParams | ForYouQuery
): Promise<ForYouHandlerOk> {
  const query: ForYouQuery =
    searchParams instanceof URLSearchParams
      ? { cursor: searchParams.get('cursor'), limit: searchParams.get('limit') }
      : searchParams;
  return getReelsForYou(authUserId, query);
}
