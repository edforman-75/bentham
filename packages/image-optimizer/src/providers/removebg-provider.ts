/**
 * remove.bg Background Removal Provider
 *
 * Uses remove.bg API to remove backgrounds from images with non-white backgrounds.
 * Best for: product flat-lays, polos, items photographed on gray/colored backgrounds.
 */

export interface RemoveBgConfig {
  apiKey: string;
  /** Output size - 'auto', 'preview' (up to 0.25 MP), 'full', '4k' */
  size?: 'auto' | 'preview' | 'full' | '4k';
}

export interface RemoveBgResult {
  /** PNG image data with transparent background */
  imageData: Buffer;
  /** Credits used for this request */
  creditsUsed: number;
  /** Remaining credits */
  creditsRemaining?: number;
  /** Detected foreground type */
  detectedType: 'person' | 'product' | 'unknown';
  /** Original image dimensions */
  originalWidth?: number;
  originalHeight?: number;
}

/**
 * Remove background from an image using remove.bg API
 */
export async function removeBackground(
  imageUrl: string,
  config: RemoveBgConfig
): Promise<RemoveBgResult> {
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: {
      'X-Api-Key': config.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      image_url: imageUrl,
      size: config.size || 'auto',
      format: 'png',
      type: 'product',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`remove.bg API error: ${response.status} - ${errorText}`);
  }

  const imageData = Buffer.from(await response.arrayBuffer());

  const creditsUsed = parseInt(response.headers.get('X-Credits-Charged') || '1', 10);
  const creditsRemaining = response.headers.get('X-Credits-Remaining');
  const typeHeader = response.headers.get('X-Type') || 'unknown';
  const widthHeader = response.headers.get('X-Width');
  const heightHeader = response.headers.get('X-Height');

  // Map remove.bg type to our type
  let detectedType: 'person' | 'product' | 'unknown' = 'unknown';
  if (typeHeader === 'person') {
    detectedType = 'person';
  } else if (typeHeader === 'product' || typeHeader === 'car' || typeHeader === 'animal') {
    detectedType = 'product';
  }

  return {
    imageData,
    creditsUsed,
    creditsRemaining: creditsRemaining ? parseInt(creditsRemaining, 10) : undefined,
    detectedType,
    originalWidth: widthHeader ? parseInt(widthHeader, 10) : undefined,
    originalHeight: heightHeader ? parseInt(heightHeader, 10) : undefined,
  };
}

/**
 * Check if an image likely needs background removal based on analysis
 * (Simple heuristic - in production you might use ML or manual flagging)
 */
export function likelyNeedsBackgroundRemoval(imageUrl: string): boolean {
  // Images with these patterns in filename often have non-white backgrounds
  const patterns = [
    /polo/i,
    /flat/i,
    /product.*only/i,
    /gray.*bg/i,
    /grey.*bg/i,
  ];

  return patterns.some(pattern => pattern.test(imageUrl));
}
