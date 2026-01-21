/**
 * 2Captcha Location Mapping
 *
 * Maps Bentham LocationIds to 2Captcha geo-targeting parameters.
 * 2Captcha uses lowercase country codes and city names in their proxy username format.
 *
 * @see https://2captcha.com/proxy
 */

import type { LocationId } from '@bentham/core';

/**
 * 2Captcha geo-targeting parameters
 */
export interface TwoCaptchaGeoTarget {
  /** ISO country code (lowercase) */
  country: string;
  /** State/region name (lowercase, no spaces) */
  state?: string;
  /** City name (lowercase, no spaces) */
  city?: string;
}

/**
 * Mapping from Bentham LocationIds to 2Captcha geo-targeting parameters
 *
 * Note: 2Captcha supports 220+ countries with city-level targeting.
 * City names should be lowercase with no spaces (use hyphens or omit spaces).
 */
export const TWOCAPTCHA_LOCATION_MAP: Record<LocationId, TwoCaptchaGeoTarget> = {
  // United States
  'us-national': { country: 'us' },
  'us-nyc': { country: 'us', state: 'new_york', city: 'new_york' },
  'us-la': { country: 'us', state: 'california', city: 'los_angeles' },
  'us-chi': { country: 'us', state: 'illinois', city: 'chicago' },
  'us-hou': { country: 'us', state: 'texas', city: 'houston' },
  'us-mia': { country: 'us', state: 'florida', city: 'miami' },
  'us-sea': { country: 'us', state: 'washington', city: 'seattle' },

  // Europe
  'uk-lon': { country: 'gb', city: 'london' },
  'de-ber': { country: 'de', city: 'berlin' },
  'de-mun': { country: 'de', city: 'munich' },
  'fr-par': { country: 'fr', city: 'paris' },
  'nl-ams': { country: 'nl', city: 'amsterdam' },
  'es-mad': { country: 'es', city: 'madrid' },
  'it-rom': { country: 'it', city: 'rome' },

  // Asia Pacific
  'jp-tok': { country: 'jp', city: 'tokyo' },
  'au-syd': { country: 'au', city: 'sydney' },
  'sg-sg': { country: 'sg', city: 'singapore' },
  'in-mum': { country: 'in', city: 'mumbai' },

  // Americas
  'ca-tor': { country: 'ca', city: 'toronto' },
  'ca-van': { country: 'ca', city: 'vancouver' },
  'br-sao': { country: 'br', city: 'sao_paulo' },
  'mx-mex': { country: 'mx', city: 'mexico_city' },
};

/**
 * Get 2Captcha geo-targeting parameters for a Bentham location
 */
export function getTwoCaptchaGeoTarget(location: LocationId): TwoCaptchaGeoTarget | undefined {
  return TWOCAPTCHA_LOCATION_MAP[location];
}

/**
 * Check if a location is supported by 2Captcha
 */
export function isTwoCaptchaLocationSupported(location: LocationId): boolean {
  return location in TWOCAPTCHA_LOCATION_MAP;
}

/**
 * Get all LocationIds supported by 2Captcha
 */
export function getTwoCaptchaSupportedLocations(): LocationId[] {
  return Object.keys(TWOCAPTCHA_LOCATION_MAP) as LocationId[];
}

/**
 * Build 2Captcha username with geo-targeting parameters
 *
 * Format: {apiKey}-country-{cc}[-state-{state}][-city-{city}][-session-{duration}][-sessid-{sessionId}]
 */
export function buildTwoCaptchaUsername(
  apiKey: string,
  geoTarget: TwoCaptchaGeoTarget,
  options?: {
    sessionDuration?: number;
    sessionId?: string;
  }
): string {
  const parts: string[] = [apiKey];

  // Add country (required)
  parts.push(`country-${geoTarget.country}`);

  // Add state if provided
  if (geoTarget.state) {
    parts.push(`state-${geoTarget.state}`);
  }

  // Add city if provided
  if (geoTarget.city) {
    parts.push(`city-${geoTarget.city}`);
  }

  // Add session duration if provided (0-120 minutes)
  if (options?.sessionDuration !== undefined) {
    const duration = Math.min(120, Math.max(0, options.sessionDuration));
    parts.push(`session-${duration}`);
  }

  // Add session ID for sticky sessions
  if (options?.sessionId) {
    parts.push(`sessid-${options.sessionId}`);
  }

  return parts.join('-');
}
