/**
 * Marketplace Image Processor
 *
 * Processes images for Amazon/Walmart marketplace compliance.
 * Handles both white-background and non-white-background images.
 * Applies different rules for images with/without people.
 */

export interface MarketplaceProcessorConfig {
  cloudinaryCloudName: string;
  removeBgApiKey?: string;
}

export interface ImageAnalysis {
  /** Whether the image contains a person/model */
  hasPerson: boolean;
  /** Whether background is white/near-white */
  hasWhiteBackground: boolean;
  /** Original dimensions */
  width: number;
  height: number;
  /** Aspect ratio (height/width) */
  aspectRatio: number;
  /** Detected by remove.bg or other service */
  detectedType?: 'person' | 'product' | 'unknown';
}

export interface MarketplaceImageOptions {
  /** Target marketplace */
  marketplace: 'amazon' | 'walmart';
  /** Image analysis results */
  analysis: ImageAnalysis;
  /** Override: force specific positioning */
  forceGravity?: 'center' | 'north' | 'south';
  /** White space margin in pixels (default: auto-calculated) */
  topMargin?: number;
}

export interface ProcessedImage {
  /** Final image URL or data */
  url?: string;
  imageData?: Buffer;
  /** Transformation applied */
  transformation: string;
  /** Dimensions */
  width: number;
  height: number;
  /** Processing method used */
  method: 'cloudinary' | 'removebg+cloudinary' | 'removebg+local';
  /** Rules applied */
  rulesApplied: string[];
}

/**
 * Marketplace specifications
 */
const MARKETPLACE_SPECS = {
  amazon: { width: 1600, height: 1600, format: 'jpg', quality: 92 },
  walmart: { width: 2000, height: 2000, format: 'jpg', quality: 90 },
};

/**
 * Processing rules based on image content
 */
export const PROCESSING_RULES = {
  /** Rules for images WITH a person (model shots) */
  withPerson: {
    gravity: 'center',           // Keep person centered
    maxFillPercent: 85,          // Leave padding around person
    allowTopCrop: false,         // Never crop the head
    allowBottomCrop: true,       // Can crop feet slightly if needed
    preferredBackground: 'auto:border', // Edge sampling works well for studio shots
    scalingMode: 'fit',          // Fit within frame, don't overflow
  },

  /** Rules for images WITHOUT a person (flat lay / product only) */
  withoutPerson: {
    gravity: 'south',            // Position at bottom of frame
    maxFillPercent: 95,          // Can fill most of frame
    allowTopCrop: false,         // Keep collar/top visible
    allowBottomCrop: true,       // Bottom often truncated anyway
    preferredBackground: 'white', // Pure white for compliance
    scalingMode: 'edge-to-edge', // Enlarge to fill width
  },
};

/**
 * Get the appropriate processing rules based on image analysis
 */
export function getProcessingRules(analysis: ImageAnalysis) {
  return analysis.hasPerson ? PROCESSING_RULES.withPerson : PROCESSING_RULES.withoutPerson;
}

/**
 * Generate Cloudinary transformation URL based on image analysis
 */
export function getCloudinaryMarketplaceUrl(
  sourceUrl: string,
  cloudName: string,
  options: MarketplaceImageOptions
): ProcessedImage {
  const spec = MARKETPLACE_SPECS[options.marketplace];
  const rules = getProcessingRules(options.analysis);
  const encoded = encodeURIComponent(sourceUrl);
  const rulesApplied: string[] = [];

  let transformation: string;
  let method: ProcessedImage['method'] = 'cloudinary';

  // Determine gravity
  const gravity = options.forceGravity || rules.gravity;
  rulesApplied.push(`gravity: ${gravity}`);

  // Determine background
  const background = options.analysis.hasWhiteBackground
    ? 'auto:border'  // Edge sampling for white backgrounds
    : 'white';       // Pure white for non-white backgrounds
  rulesApplied.push(`background: ${background}`);

  if (options.analysis.hasPerson) {
    // === PERSON IN IMAGE: Fit within frame, keep centered ===
    rulesApplied.push('mode: fit-with-padding (person detected)');
    transformation = `w_${spec.width},h_${spec.height},c_pad,g_${gravity},b_${background},f_${spec.format},q_${spec.quality}`;
  } else {
    // === NO PERSON: Can enlarge to fill frame ===
    if (rules.scalingMode === 'edge-to-edge' && !options.analysis.hasWhiteBackground) {
      // Edge-to-edge scaling for flat lays with non-white backgrounds
      // This requires remove.bg first, so flag it
      rulesApplied.push('mode: edge-to-edge (needs remove.bg)');
      method = 'removebg+cloudinary';
      // Return basic transformation - actual processing needs remove.bg
      transformation = `w_${spec.width},h_${spec.height},c_pad,g_south,b_white,f_${spec.format},q_${spec.quality}`;
    } else {
      // Standard positioning at bottom
      rulesApplied.push('mode: position-south (no person)');
      transformation = `w_${spec.width},h_${spec.height},c_pad,g_south,b_${background},f_${spec.format},q_${spec.quality}`;
    }
  }

  const url = `https://res.cloudinary.com/${cloudName}/image/fetch/${transformation}/${encoded}`;

  return {
    url,
    transformation,
    width: spec.width,
    height: spec.height,
    method,
    rulesApplied,
  };
}

/**
 * Generate Cloudinary transformation for edge-to-edge flat lay with top margin
 *
 * This scales the image to fill the full width, adds white space above,
 * then crops to the target square dimensions.
 *
 * Best for: flat lay products that need to fill the frame
 */
export function getEdgeToEdgeTransformUrl(
  sourceUrl: string,
  cloudName: string,
  options: {
    marketplace: 'amazon' | 'walmart';
    topMargin: number;  // pixels of white space above
    originalAspectRatio?: number; // height/width ratio, default 1.33 (4:3)
  }
): string {
  const spec = MARKETPLACE_SPECS[options.marketplace];
  const encoded = encodeURIComponent(sourceUrl);

  // Calculate scaled height when width = target width
  const aspectRatio = options.originalAspectRatio || 1.33;
  const scaledHeight = Math.round(spec.width * aspectRatio);
  const padHeight = scaledHeight + options.topMargin;

  // Chain: scale to full width → pad top with white → crop to square from top
  const transformation = [
    `c_scale,w_${spec.width}`,
    `c_pad,h_${padHeight},g_south,b_white`,
    `c_crop,w_${spec.width},h_${spec.height},g_north`,
    `f_${spec.format},q_${spec.quality}`,
  ].join('/');

  return `https://res.cloudinary.com/${cloudName}/image/fetch/${transformation}/${encoded}`;
}

/**
 * Determine the best processing approach for an image
 */
export function recommendProcessingApproach(
  _imageUrl: string,
  hasWhiteBackground: boolean
): {
  approach: 'cloudinary-only' | 'removebg-required';
  reason: string;
  transformation: string;
} {
  if (hasWhiteBackground) {
    return {
      approach: 'cloudinary-only',
      reason: 'Image has white/light background - can use edge sampling',
      transformation: 'c_pad,b_auto:border',
    };
  } else {
    return {
      approach: 'removebg-required',
      reason: 'Image has non-white background - needs background removal first',
      transformation: 'remove.bg → resize → add white bg',
    };
  }
}
