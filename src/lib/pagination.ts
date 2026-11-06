import { APP_CONSTANTS } from '../config/constants.js';

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    limit: number;
    count: number;
  };
}

export function parsePagination(query: Record<string, unknown>): { cursor?: string; limit: number } {
  let limit = Number(query.limit) || APP_CONSTANTS.PAGINATION.DEFAULT_LIMIT;
  if (limit > APP_CONSTANTS.PAGINATION.MAX_LIMIT) {
    limit = APP_CONSTANTS.PAGINATION.MAX_LIMIT;
  }
  if (limit < 1) {
    limit = 1;
  }

  const cursor = typeof query.cursor === 'string' && query.cursor.trim().length > 0 ? query.cursor.trim() : undefined;
  return { cursor, limit };
}

export function encodeCursor(id: string): string {
  return Buffer.from(id).toString('base64url');
}

export function decodeCursor(cursor?: string): string | undefined {
  if (!cursor) return undefined;
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}

export function buildPaginatedResponse<T extends { id: string }>(
  items: T[],
  limit: number
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextItem = hasMore ? data[data.length - 1] : null;
  const nextCursor = nextItem ? encodeCursor(nextItem.id) : null;

  return {
    data,
    meta: {
      nextCursor,
      limit,
      count: data.length,
    },
  };
}
