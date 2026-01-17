/**
 * Geographic location types for Bentham
 */

/**
 * Configuration for a geographic location
 */
export interface LocationConfig {
  /** Unique identifier for the location (e.g., 'us-nyc') */
  id: string;
  /** Human-readable name (e.g., 'New York, US') */
  name: string;
  /** ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB') */
  country: string;
  /** State or province (e.g., 'NY', 'CA') */
  region?: string;
  /** City name (e.g., 'New York', 'London') */
  city?: string;
  /** Type of proxy required */
  proxyType: 'residential' | 'datacenter' | 'mobile';
  /** Whether to require the same IP for the entire session */
  requireSticky: boolean;
}

/**
 * Supported locations with their configurations
 */
export const LOCATIONS = {
  // United States
  'us-national': { country: 'US', name: 'United States (National)' },
  'us-nyc': { country: 'US', region: 'NY', city: 'New York', name: 'New York, US' },
  'us-la': { country: 'US', region: 'CA', city: 'Los Angeles', name: 'Los Angeles, US' },
  'us-chi': { country: 'US', region: 'IL', city: 'Chicago', name: 'Chicago, US' },
  'us-hou': { country: 'US', region: 'TX', city: 'Houston', name: 'Houston, US' },
  'us-mia': { country: 'US', region: 'FL', city: 'Miami', name: 'Miami, US' },
  'us-sea': { country: 'US', region: 'WA', city: 'Seattle', name: 'Seattle, US' },

  // Europe
  'uk-lon': { country: 'GB', city: 'London', name: 'London, UK' },
  'de-ber': { country: 'DE', city: 'Berlin', name: 'Berlin, Germany' },
  'de-mun': { country: 'DE', city: 'Munich', name: 'Munich, Germany' },
  'fr-par': { country: 'FR', city: 'Paris', name: 'Paris, France' },
  'nl-ams': { country: 'NL', city: 'Amsterdam', name: 'Amsterdam, Netherlands' },
  'es-mad': { country: 'ES', city: 'Madrid', name: 'Madrid, Spain' },
  'it-rom': { country: 'IT', city: 'Rome', name: 'Rome, Italy' },

  // Asia Pacific
  'jp-tok': { country: 'JP', city: 'Tokyo', name: 'Tokyo, Japan' },
  'au-syd': { country: 'AU', city: 'Sydney', name: 'Sydney, Australia' },
  'sg-sg': { country: 'SG', city: 'Singapore', name: 'Singapore' },
  'in-mum': { country: 'IN', city: 'Mumbai', name: 'Mumbai, India' },

  // Americas
  'ca-tor': { country: 'CA', city: 'Toronto', name: 'Toronto, Canada' },
  'ca-van': { country: 'CA', city: 'Vancouver', name: 'Vancouver, Canada' },
  'br-sao': { country: 'BR', city: 'São Paulo', name: 'São Paulo, Brazil' },
  'mx-mex': { country: 'MX', city: 'Mexico City', name: 'Mexico City, Mexico' },
} as const;

/**
 * Valid location identifiers
 */
export type LocationId = keyof typeof LOCATIONS;

/**
 * Verification result for geographic location
 */
export interface LocationVerification {
  /** Requested location */
  requested: LocationId;
  /** Actual detected location */
  actual: {
    ip: string;
    country: string;
    region?: string;
    city?: string;
    /** Confidence in geolocation (0-1) */
    confidence: number;
  };
  /** Whether actual matches requested */
  match: boolean;
  /** Any concerns about the match */
  warnings?: string[];
}

/**
 * Check if a location ID is valid
 */
export function isValidLocationId(id: string): id is LocationId {
  return id in LOCATIONS;
}

/**
 * Get location configuration by ID
 */
export function getLocationConfig(id: LocationId): (typeof LOCATIONS)[LocationId] {
  return LOCATIONS[id];
}
