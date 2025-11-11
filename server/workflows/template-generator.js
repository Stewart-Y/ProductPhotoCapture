/**
 * Background Template Generator
 *
 * Generates reusable background templates using Freepik Mystic API
 * Creates multiple variants per template for user selection
 */

import crypto from 'crypto';
import { FreepikBackgroundProvider } from '../providers/freepik/background.js';
import { getStorage } from '../storage/index.js';

/**
 * Generate background template with multiple variants
 *
 * @param {Object} params
 * @param {string} params.templateId - Template ID (optional, will be generated if not provided)
 * @param {string} params.name - Template name
 * @param {string} params.theme - Theme preset (kitchen, outdoors, minimal, luxury, custom)
 * @param {string} params.customPrompt - Custom prompt (if theme is 'custom')
 * @param {number} params.variantCount - Number of variants to generate (default: 3)
 * @param {Object} params.db - Database connection
 * @returns {Promise<Object>} Result with templateId, variants
 */
export async function generateBackgroundTemplate({
  templateId = null,
  name,
  theme = 'default',
  customPrompt = null,
  variantCount = 3,
  db
}) {
  const startTime = Date.now();
  const finalTemplateId = templateId || generateTemplateId();

  console.log('[TemplateGenerator] Starting template generation', {
    templateId: finalTemplateId,
    name,
    theme,
    variantCount,
    customPrompt: !!customPrompt
  });

  try {
    // Step 1: Create template record with 'generating' status (only if not already created)
    if (!templateId) {
      db.prepare(`
        INSERT INTO background_templates (id, name, theme, prompt, status, created_at)
        VALUES (?, ?, ?, ?, 'generating', datetime('now'))
      `).run(
        finalTemplateId,
        name,
        theme,
        customPrompt || `Theme: ${theme}`
      );

      console.log('[TemplateGenerator] Template record created:', finalTemplateId);
    } else {
      console.log('[TemplateGenerator] Using existing template record:', finalTemplateId);
    }

    // Step 2: Initialize Freepik Background provider
    const provider = new FreepikBackgroundProvider({
      apiKey: process.env.FREEPIK_API_KEY
    });

    // Step 3: Generate variants in parallel
    const variantPromises = [];
    for (let variant = 1; variant <= variantCount; variant++) {
      variantPromises.push(
        generateTemplateVariant({
          provider,
          templateId: finalTemplateId,
          variant,
          theme,
          customPrompt,
          db
        })
      );
    }

    const variantResults = await Promise.allSettled(variantPromises);

    // Step 4: Process results
    const successfulVariants = variantResults.filter(r => r.status === 'fulfilled' && r.value.success);
    const failedVariants = variantResults.filter(r => r.status === 'rejected' || !r.value.success);

    console.log('[TemplateGenerator] Variant generation complete', {
      templateId: finalTemplateId,
      total: variantCount,
      successful: successfulVariants.length,
      failed: failedVariants.length
    });

    // Step 5: Update template status
    if (successfulVariants.length > 0) {
      db.prepare(`
        UPDATE background_templates
        SET status = 'active', updated_at = datetime('now')
        WHERE id = ?
      `).run(finalTemplateId);

      const duration = Date.now() - startTime;
      const totalCost = successfulVariants.reduce((sum, r) => sum + (r.value.cost || 0), 0);

      console.log('[TemplateGenerator] Template generation successful', {
        templateId: finalTemplateId,
        name,
        variants: successfulVariants.length,
        duration: `${duration}ms`,
        totalCost: `$${totalCost.toFixed(4)}`
      });

      return {
        success: true,
        templateId: finalTemplateId,
        name,
        variantsGenerated: successfulVariants.length,
        variants: successfulVariants.map(r => r.value),
        cost: totalCost,
        duration
      };
    } else {
      // All variants failed
      db.prepare(`
        UPDATE background_templates
        SET status = 'archived', updated_at = datetime('now')
        WHERE id = ?
      `).run(finalTemplateId);

      throw new Error('All variant generations failed');
    }

  } catch (error) {
    const duration = Date.now() - startTime;

    console.error('[TemplateGenerator] Template generation failed', {
      templateId: finalTemplateId,
      name,
      error: error.message,
      duration: `${duration}ms`
    });

    // Mark template as archived on failure
    db.prepare(`
      UPDATE background_templates
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ?
    `).run(finalTemplateId);

    return {
      success: false,
      error: error.message,
      templateId: finalTemplateId,
      duration
    };
  }
}

/**
 * Generate single template variant
 */
async function generateTemplateVariant({
  provider,
  templateId,
  variant,
  theme,
  customPrompt,
  db
}) {
  console.log('[TemplateGenerator] Generating variant', { templateId, variant, theme });

  try {
    // Generate background using Freepik Mystic API
    const result = await provider.generateBackground({
      theme,
      customPrompt,
      sku: `TEMPLATE_${templateId}`,
      sha256: templateId,
      dimensions: { width: 2048, height: 2048 },
      aspectRatio: 'square_1_1',
      variant
    });

    if (!result.success) {
      throw new Error(result.error || 'Background generation failed');
    }

    // Store asset in database
    const storage = getStorage();
    const templateS3Key = `templates/${templateId}/${variant}.jpg`;

    // Copy from backgrounds/ to templates/ location
    // (The provider already uploaded to backgrounds/, we'll reference it)

    // Get image metadata from S3
    const presignedUrl = await storage.getPresignedGetUrl(result.s3Key, 3600);

    // Calculate expiry time (1 hour from now)
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // Store asset record
    db.prepare(`
      INSERT INTO template_assets (
        template_id, variant, s3_key, s3_url, s3_url_expires_at,
        width, height, format, size_bytes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      templateId,
      variant,
      result.s3Key, // Use the S3 key from background generation
      presignedUrl,
      expiresAt,
      result.metadata?.width || 2048,
      result.metadata?.height || 2048,
      result.metadata?.format || 'jpeg',
      result.metadata?.size || 0
    );

    console.log('[TemplateGenerator] Variant generated successfully', {
      templateId,
      variant,
      s3Key: result.s3Key
    });

    return {
      success: true,
      variant,
      s3Key: result.s3Key,
      s3Url: presignedUrl,
      cost: result.cost || 0,
      metadata: result.metadata
    };

  } catch (error) {
    console.error('[TemplateGenerator] Variant generation failed', {
      templateId,
      variant,
      error: error.message
    });

    return {
      success: false,
      variant,
      error: error.message
    };
  }
}

/**
 * Regenerate variants for existing template
 * Useful if user wants more options
 */
export async function regenerateTemplateVariants({
  templateId,
  variantCount = 3,
  db
}) {
  console.log('[TemplateGenerator] Regenerating variants', { templateId, variantCount });

  try {
    // Get template details
    const template = db.prepare(`
      SELECT * FROM background_templates WHERE id = ?
    `).get(templateId);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Get current max variant number
    const maxVariantResult = db.prepare(`
      SELECT MAX(variant) as max_variant FROM template_assets WHERE template_id = ?
    `).get(templateId);

    const startVariant = (maxVariantResult?.max_variant || 0) + 1;

    // Initialize provider
    const provider = new FreepikBackgroundProvider({
      apiKey: process.env.FREEPIK_API_KEY
    });

    // Generate new variants
    const variantPromises = [];
    for (let i = 0; i < variantCount; i++) {
      const variant = startVariant + i;
      variantPromises.push(
        generateTemplateVariant({
          provider,
          templateId,
          variant,
          theme: template.theme,
          customPrompt: template.theme === 'custom' ? template.prompt : null,
          db
        })
      );
    }

    const variantResults = await Promise.allSettled(variantPromises);
    const successfulVariants = variantResults.filter(r => r.status === 'fulfilled' && r.value.success);

    console.log('[TemplateGenerator] Variant regeneration complete', {
      templateId,
      generated: successfulVariants.length,
      failed: variantCount - successfulVariants.length
    });

    return {
      success: true,
      templateId,
      variantsGenerated: successfulVariants.length,
      variants: successfulVariants.map(r => r.value)
    };

  } catch (error) {
    console.error('[TemplateGenerator] Variant regeneration failed', {
      templateId,
      error: error.message
    });

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get template with all variants
 */
export function getTemplateWithAssets(finalTemplateId, db, onlySelected = false) {
  const template = db.prepare(`
    SELECT * FROM background_templates WHERE id = ?
  `).get(finalTemplateId);

  if (!template) {
    return null;
  }

  // Optionally filter to only selected variants
  const query = onlySelected
    ? `SELECT * FROM template_assets WHERE template_id = ? AND selected = 1 ORDER BY variant ASC`
    : `SELECT * FROM template_assets WHERE template_id = ? ORDER BY variant ASC`;

  const assets = db.prepare(query).all(finalTemplateId);

  return {
    ...template,
    assets
  };
}

/**
 * Generate unique template ID
 */
function generateTemplateId() {
  return `tpl_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Refresh presigned URLs for template assets
 * Called when URLs are close to expiry
 */
export async function refreshTemplateAssetUrls(finalTemplateId, db) {
  const storage = getStorage();

  const assets = db.prepare(`
    SELECT * FROM template_assets WHERE template_id = ?
  `).all(finalTemplateId);

  for (const asset of assets) {
    const newUrl = await storage.getPresignedGetUrl(asset.s3_key, 3600);
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    db.prepare(`
      UPDATE template_assets
      SET s3_url = ?, s3_url_expires_at = ?
      WHERE id = ?
    `).run(newUrl, expiresAt, asset.id);
  }

  console.log('[TemplateGenerator] Refreshed presigned URLs', {
    templateId: finalTemplateId,
    assetCount: assets.length
  });

  return true;
}

export default {
  generateBackgroundTemplate,
  regenerateTemplateVariants,
  getTemplateWithAssets,
  refreshTemplateAssetUrls
};
