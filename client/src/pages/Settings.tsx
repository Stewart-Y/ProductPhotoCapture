import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { Save, Sparkles, Zap, Target, Image as ImageIcon } from 'lucide-react';

export const Settings: React.FC = () => {
  const [cutoutPrompt, setCutoutPrompt] = useState('');
  const [backgroundPrompt, setBackgroundPrompt] = useState('');
  const [activeCutoutPrompt, setActiveCutoutPrompt] = useState<string | null>(null);
  const [activeBackgroundPrompt, setActiveBackgroundPrompt] = useState<string | null>(null);
  const [isSavingCutout, setIsSavingCutout] = useState(false);
  const [isSavingBackground, setIsSavingBackground] = useState(false);
  const [cutoutSuccess, setCutoutSuccess] = useState(false);
  const [backgroundSuccess, setBackgroundSuccess] = useState(false);

  // Workflow preference state
  const [workflowPreference, setWorkflowPreference] = useState<'cutout_composite' | 'seedream_edit'>('cutout_composite');
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [workflowSuccess, setWorkflowSuccess] = useState(false);

  // Template selector state
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSuccess, setTemplateSuccess] = useState(false);

  // Load active prompts and workflow preference on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [cutoutResponse, backgroundResponse, workflowResponse, templatesResponse, activeTemplateResponse] = await Promise.all([
          fetch('http://localhost:4000/api/prompts/cutout'),
          fetch('http://localhost:4000/api/prompts/background'),
          fetch('http://localhost:4000/api/settings/workflow'),
          fetch('http://localhost:4000/api/templates?status=active'),
          fetch('http://localhost:4000/api/settings/active-template')
        ]);

        if (cutoutResponse.ok) {
          const data = await cutoutResponse.json();
          setActiveCutoutPrompt(data.prompt);
        }

        if (backgroundResponse.ok) {
          const data = await backgroundResponse.json();
          setActiveBackgroundPrompt(data.prompt);
        }

        if (workflowResponse.ok) {
          const data = await workflowResponse.json();
          setWorkflowPreference(data.workflow);
        }

        if (templatesResponse.ok) {
          const data = await templatesResponse.json();
          if (data.success) {
            setTemplates(data.templates);
          }
        }

        if (activeTemplateResponse.ok) {
          const data = await activeTemplateResponse.json();
          if (data.success && data.activeTemplate) {
            setActiveTemplateId(data.activeTemplate.id);
          }
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveCutoutPrompt = async () => {
    if (!cutoutPrompt.trim()) return;

    setIsSavingCutout(true);
    setCutoutSuccess(false);

    try {
      const response = await fetch('http://localhost:4000/api/prompts/cutout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: cutoutPrompt.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveCutoutPrompt(data.prompt);
        setCutoutPrompt('');
        setCutoutSuccess(true);
        setTimeout(() => setCutoutSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving cutout prompt:', error);
    } finally {
      setIsSavingCutout(false);
    }
  };

  const handleSaveBackgroundPrompt = async () => {
    if (!backgroundPrompt.trim()) return;

    setIsSavingBackground(true);
    setBackgroundSuccess(false);

    try {
      const response = await fetch('http://localhost:4000/api/prompts/background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: backgroundPrompt.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveBackgroundPrompt(data.prompt);
        setBackgroundPrompt('');
        setBackgroundSuccess(true);
        setTimeout(() => setBackgroundSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving background prompt:', error);
    } finally {
      setIsSavingBackground(false);
    }
  };

  const handleSaveWorkflow = async (newWorkflow: 'cutout_composite' | 'seedream_edit') => {
    setIsSavingWorkflow(true);
    setWorkflowSuccess(false);

    try {
      const response = await fetch('http://localhost:4000/api/settings/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: newWorkflow })
      });

      if (response.ok) {
        setWorkflowPreference(newWorkflow);
        setWorkflowSuccess(true);
        setTimeout(() => setWorkflowSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving workflow preference:', error);
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  const handleSetActiveTemplate = async (templateId: string | null) => {
    setIsSavingTemplate(true);
    setTemplateSuccess(false);

    try {
      const response = await fetch('http://localhost:4000/api/settings/active-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId })
      });

      if (response.ok) {
        setActiveTemplateId(templateId);
        setTemplateSuccess(true);
        setTimeout(() => setTemplateSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving active template:', error);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure global AI prompts for image processing
        </p>
      </div>

      {/* AI Prompts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>AI Prompts</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            These prompts will be applied to all future jobs. Changes take effect immediately for new uploads.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cutout Prompt */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-1">
                Cutout Instructions (Advanced)
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Note: The Freepik API currently does not support custom prompts for background removal.
                This setting is reserved for future integration with prompt-based segmentation services.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cutoutPrompt}
                  onChange={(e) => setCutoutPrompt(e.target.value)}
                  placeholder="e.g., remove everything except the bottle"
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  disabled
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveCutoutPrompt();
                    }
                  }}
                />
                <button
                  onClick={handleSaveCutoutPrompt}
                  disabled
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSavingCutout ? 'Saving...' : 'Save'}
                </button>
              </div>
              {cutoutSuccess && (
                <p className="text-xs text-green-600 mt-2">Cutout prompt saved successfully!</p>
              )}
            </div>
            {activeCutoutPrompt && (
              <div className="bg-muted/50 rounded-md p-3 border border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Active Cutout Prompt:</p>
                <p className="text-sm text-foreground">{activeCutoutPrompt}</p>
              </div>
            )}
          </div>

          {/* Background Prompt */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-foreground block mb-1">
                Background Theme
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                {workflowPreference === 'seedream_edit' ? (
                  <>
                    Describe the background theme for AI replacement. The AI will replace your product's background while trying to preserve the product itself.
                    <br />
                    <strong className="text-foreground">Examples:</strong> "halloween themed with pumpkins", "luxury marble surface", "rustic wooden table"
                  </>
                ) : (
                  <>
                    Describe the background scene theme (backgrounds only, no products). The system will automatically generate empty backgrounds that your product will be composited onto.
                    <br />
                    <strong className="text-foreground">Examples:</strong> "halloween themed with pumpkins and autumn leaves", "luxury marble surface", "rustic wooden table with soft lighting"
                  </>
                )}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backgroundPrompt}
                  onChange={(e) => setBackgroundPrompt(e.target.value)}
                  placeholder="e.g., halloween themed with pumpkins and spooky atmosphere"
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveBackgroundPrompt();
                    }
                  }}
                />
                <button
                  onClick={handleSaveBackgroundPrompt}
                  disabled={!backgroundPrompt.trim() || isSavingBackground}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isSavingBackground ? 'Saving...' : 'Save'}
                </button>
              </div>
              {backgroundSuccess && (
                <p className="text-xs text-green-600 mt-2">Background theme saved successfully!</p>
              )}
            </div>
            {activeBackgroundPrompt && (
              <div className="bg-muted/50 rounded-md p-3 border border-border">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Active Background Theme:</p>
                <p className="text-sm text-foreground">{activeBackgroundPrompt}</p>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              How It Works
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• AI generates empty background scenes using Freepik Mystic API (~20 seconds per background)</li>
              <li>• Your product cutout is then composited onto the AI background with drop shadow</li>
              <li>• View final results in the "Composites" tab (not "Backgrounds" tab)</li>
              <li>• Prompts apply globally to all new jobs - changes do not affect existing jobs</li>
              <li>• Cost: $0.02 cutout + $0.10-0.20 backgrounds per image</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Workflow Selection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <CardTitle>Background Generation Workflow</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Choose how background images are generated. This setting applies to all new jobs.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Option A: Cutout + Composite */}
          <div
            onClick={() => handleSaveWorkflow('cutout_composite')}
            className={`border rounded-lg p-4 cursor-pointer transition-all ${
              workflowPreference === 'cutout_composite'
                ? 'border-primary bg-primary/5 ring-2 ring-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Cutout + Composite (Precise)
                  {workflowPreference === 'cutout_composite' && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Current</span>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  3-step process: Remove background → Generate empty backgrounds → Composite cutout with drop shadow
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>✓ 100% pixel-perfect product preservation</li>
                  <li>✓ Professional drop shadows and centering control</li>
                  <li>✓ Clean separation of product and background</li>
                  <li>• Cost: $0.02 (cutout) + $0.10-0.20 (backgrounds) = $0.12-0.22</li>
                  <li>• Processing time: ~40-60 seconds</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Option B: Seedream 4 Edit */}
          <div
            onClick={() => handleSaveWorkflow('seedream_edit')}
            className={`border rounded-lg p-4 cursor-pointer transition-all ${
              workflowPreference === 'seedream_edit'
                ? 'border-primary bg-primary/5 ring-2 ring-primary'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  AI Edit (Fast)
                  {workflowPreference === 'seedream_edit' && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Current</span>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Single-step process: AI replaces background while preserving product in one operation
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>✓ Fast single-step AI editing</li>
                  <li>✓ Natural lighting and shadows automatically applied</li>
                  <li>✓ No compositing artifacts</li>
                  <li>• Cost: ~$0.16 per job (verify pricing)</li>
                  <li>• Processing time: ~20-30 seconds</li>
                  <li>⚠️ ~95% product preservation (AI may adjust lighting/edges)</li>
                </ul>
              </div>
            </div>
          </div>

          {workflowSuccess && (
            <p className="text-xs text-green-600">Workflow preference saved successfully!</p>
          )}

          {/* Info Box */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
              Important Notes
            </h4>
            <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
              <li>• Changes apply to NEW jobs only - existing jobs are unaffected</li>
              <li>• Both workflows use Freepik API with different endpoints</li>
              <li>• You can switch workflows at any time</li>
              <li>• Seedream Edit is experimental - quality may vary by product type</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Background Template Selector */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-primary" />
            <CardTitle>Background Template (Optional)</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Select a reusable background template for consistent compositing. Only works with Seedream Edit workflow.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {workflowPreference !== 'seedream_edit' && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Background templates require the <strong>AI Edit (Fast)</strong> workflow. Please switch workflows above to enable templates.
              </p>
            </div>
          )}

          {workflowPreference === 'seedream_edit' && templates.length === 0 && (
            <div className="text-center py-6 border-2 border-dashed border-border rounded-lg">
              <p className="text-muted-foreground mb-2">No templates available</p>
              <a
                href="/templates"
                className="text-sm text-primary hover:underline"
              >
                Create your first template
              </a>
            </div>
          )}

          {workflowPreference === 'seedream_edit' && templates.length > 0 && (
            <div className="space-y-3">
              {/* None Option */}
              <div
                onClick={() => handleSetActiveTemplate(null)}
                className={`border rounded-lg p-3 cursor-pointer transition-all ${
                  activeTemplateId === null
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-sm">No Template (Use Prompt)</h4>
                    <p className="text-xs text-muted-foreground">Generate backgrounds using theme prompt</p>
                  </div>
                  {activeTemplateId === null && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
                  )}
                </div>
              </div>

              {/* Template Options */}
              {templates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => handleSetActiveTemplate(template.id)}
                  className={`border rounded-lg p-3 cursor-pointer transition-all ${
                    activeTemplateId === template.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-sm">{template.name}</h4>
                      <p className="text-xs text-muted-foreground capitalize">
                        {template.theme} • {template.variant_count} variant(s) • Used {template.used_count} time(s)
                      </p>
                    </div>
                    {activeTemplateId === template.id && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Active</span>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <a
                  href="/templates"
                  className="text-sm text-primary hover:underline"
                >
                  Manage Templates
                </a>
                {templateSuccess && (
                  <p className="text-xs text-green-600">Template preference saved successfully!</p>
                )}
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              How Templates Work
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Generate background templates once, reuse for all products</li>
              <li>• Ensures consistent background across your entire catalog</li>
              <li>• Saves cost - only pay for template generation, not per-product</li>
              <li>• AI composites your product cutout with the selected template</li>
              <li>• Create templates in the Templates page with custom prompts</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
