/**
 * @bentham/social-listening
 *
 * Social listening integrations for Bentham.
 * Provides adapters for Brand24 and other social listening platforms.
 */

// Types
export type {
  Brand24Mention,
  Brand24Project,
  SocialMention,
  KeywordConfig,
  SocialStudyConfig,
  MentionStats,
  CompetitorComparison,
  SocialListeningReport,
} from './types.js';

export { BRAND24_CSV_COLUMNS } from './types.js';

// Brand24 Importer
export {
  parseBrand24Csv,
  toSocialMention,
  importBrand24File,
  findBrand24Exports,
  calculateMentionStats,
} from './brand24-importer.js';

// Database
export {
  SocialListeningDatabase,
  createTascDatabase,
  type DatabaseConfig,
} from './database.js';

// TASC Study
export {
  TASC_KEYWORDS,
  importBrand24ForTasc,
  importVisibilityResults,
  generateTascReport,
} from './tasc-study.js';
