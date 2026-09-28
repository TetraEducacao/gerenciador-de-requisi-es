/**
 * Service for evaluating filter rules on webhook data.
 * Supports filtering by user-agent, headers, and payload fields.
 */

import { Logger } from 'request-manager-shared';

const logger = new Logger('FilterRulesService');

export interface FilterRules {
  user_agent?: string;
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
}

export class FilterRulesService {
  /**
   * Check if webhook data matches filter rules
   * Returns true if data matches (or if no filters defined)
   */
  matchesFilter(
    filterRules: FilterRules | null | undefined,
    userAgent: string | undefined,
    headers: Record<string, string> | undefined,
    payload: unknown | undefined
  ): boolean {
    // If no filters defined, allow all
    if (!filterRules) {
      return true;
    }

    // Check user-agent
    if (filterRules.user_agent) {
      if (!userAgent || userAgent !== filterRules.user_agent) {
        logger.debug('Filter mismatch: user-agent', {
          expected: filterRules.user_agent,
          received: userAgent,
        });
        return false;
      }
    }

    // Check headers
    if (filterRules.headers && typeof filterRules.headers === 'object') {
      for (const [key, expectedValue] of Object.entries(filterRules.headers)) {
        const receivedValue = headers?.[key.toLowerCase()];
        if (receivedValue !== expectedValue) {
          logger.debug('Filter mismatch: header', {
            header: key,
            expected: expectedValue,
            received: receivedValue,
          });
          return false;
        }
      }
    }

    // Check payload fields
    if (filterRules.payload && typeof filterRules.payload === 'object') {
      const payloadObj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      for (const [key, expectedValue] of Object.entries(filterRules.payload)) {
        const receivedValue = payloadObj[key];
        if (receivedValue !== expectedValue) {
          logger.debug('Filter mismatch: payload field', {
            field: key,
            expected: expectedValue,
            received: receivedValue,
          });
          return false;
        }
      }
    }

    // All filters matched
    return true;
  }

  /**
   * Validate filter rules format
   */
  validateFilterRules(rules: unknown): { valid: boolean; error?: string } {
    if (rules === null || rules === undefined) {
      return { valid: true }; // Null/undefined is valid (no filters)
    }

    if (typeof rules !== 'object') {
      return { valid: false, error: 'Filter rules must be an object' };
    }

    const obj = rules as Record<string, unknown>;

    // Validate user_agent
    if (obj.user_agent !== undefined && typeof obj.user_agent !== 'string') {
      return { valid: false, error: 'user_agent must be a string' };
    }

    // Validate headers
    if (obj.headers !== undefined) {
      if (typeof obj.headers !== 'object' || Array.isArray(obj.headers)) {
        return { valid: false, error: 'headers must be an object' };
      }
      for (const [key, value] of Object.entries(obj.headers)) {
        if (typeof value !== 'string') {
          return { valid: false, error: `header value for "${key}" must be a string` };
        }
      }
    }

    // Validate payload
    if (obj.payload !== undefined) {
      if (typeof obj.payload !== 'object' || Array.isArray(obj.payload)) {
        return { valid: false, error: 'payload must be an object' };
      }
    }

    return { valid: true };
  }
}

let instance: FilterRulesService | null = null;

export function getFilterRulesService(): FilterRulesService {
  if (!instance) {
    instance = new FilterRulesService();
  }
  return instance;
}
