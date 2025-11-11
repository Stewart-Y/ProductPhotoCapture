import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { Zap, Target, X, Cpu, Scissors, Settings as SettingsIcon } from 'lucide-react';

interface SharpSettings {
  bottleHeightPercent: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
  gravity: 'center' | 'north' | 'south' | 'east' | 'west';
  sharpen?: number;
  gamma?: number;
}

export const Settings: React.FC = () => {
  // Workflow preference state
  const [workflowPreference, setWorkflowPreference] = useState<'cutout_composite'>('cutout_composite');
  const [, setIsSavingWorkflow] = useState(false);
  const [workflowSuccess, setWorkflowSuccess] = useState(false);

  // Compositor preference state
  const [compositor, setCompositor] = useState<'freepik' | 'nanobanana' | 'none'>('freepik');
  const [compositorSuccess, setCompositorSuccess] = useState(false);

  // Sharp workflow preference state
  const [sharpWorkflowEnabled, setSharpWorkflowEnabled] = useState(false);
  const [sharpWorkflowSuccess, setSharpWorkflowSuccess] = useState(false);

  // Sharp settings state
  const [showSharpSettings, setShowSharpSettings] = useState(false);
  const [sharpSettings, setSharpSettings] = useState<SharpSettings>({
    bottleHeightPercent: 0.75,
    quality: 90,
    format: 'jpeg',
    gravity: 'center',
    sharpen: 0,
    gamma: 1.0
  });
  const [sharpSettingsSuccess, setSharpSettingsSuccess] = useState(false);

  // Load settings on mount
  useEffect(() => {
    fetchWorkflowPreference();
    fetchCompositor();
    fetchSharpWorkflow();
    fetchSharpSettings();
  }, []);

  const fetchWorkflowPreference = async () => {
    try {
      const response = await fetch('/api/settings/workflow');
      if (response.ok) {
        const data = await response.json();
        setWorkflowPreference(data.workflow);
      }
    } catch (error) {
      console.error('Error fetching workflow preference:', error);
    }
  };

  const fetchCompositor = async () => {
    try {
      const response = await fetch('/api/settings/compositor');
      if (response.ok) {
        const data = await response.json();
        setCompositor(data.compositor || 'freepik');
      }
    } catch (error) {
      console.error('Error fetching compositor:', error);
    }
  };

  const fetchSharpWorkflow = async () => {
    try {
      const response = await fetch('/api/settings/sharp-workflow');
      if (response.ok) {
        const data = await response.json();
        setSharpWorkflowEnabled(data.enabled || false);
      }
    } catch (error) {
      console.error('Error fetching Sharp workflow:', error);
    }
  };

  const handleSaveWorkflow = async (newWorkflow: 'cutout_composite') => {
    setIsSavingWorkflow(true);
    setWorkflowSuccess(false);

    try {
      const response = await fetch('/api/settings/workflow', {
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

  const handleCompositorChange = async (newCompositor: 'freepik' | 'nanobanana' | 'none') => {
    setCompositorSuccess(false);

    try {
      const response = await fetch('/api/settings/compositor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositor: newCompositor })
      });

      if (response.ok) {
        setCompositor(newCompositor);
        setCompositorSuccess(true);
        setTimeout(() => setCompositorSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving compositor:', error);
    }
  };

  const handleSharpWorkflowToggle = async () => {
    const newValue = !sharpWorkflowEnabled;
    setSharpWorkflowSuccess(false);

    try {
      const response = await fetch('/api/settings/sharp-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newValue })
      });

      if (response.ok) {
        setSharpWorkflowEnabled(newValue);
        setSharpWorkflowSuccess(true);
        setTimeout(() => setSharpWorkflowSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving Sharp workflow:', error);
    }
  };

  const fetchSharpSettings = async () => {
    try {
      const response = await fetch('/api/settings/sharp-settings');
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSharpSettings(data.settings);
        }
      }
    } catch (error) {
      console.error('Error fetching Sharp settings:', error);
    }
  };

  const handleSaveSharpSettings = async () => {
    setSharpSettingsSuccess(false);

    try {
      const response = await fetch('/api/settings/sharp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: sharpSettings })
      });

      if (response.ok) {
        setSharpSettingsSuccess(true);
        setTimeout(() => setSharpSettingsSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error saving Sharp settings:', error);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure AI models and workflow preferences
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
          {/* AI Compositor Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-primary" />
                <CardTitle>AI Compositor Model</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose the AI model used for compositing products onto backgrounds
              </p>

              {/* Compositor Options */}
              <div className="space-y-3">
                {/* None (Sharp Only) */}
                <div
                  onClick={() => handleCompositorChange('none')}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    compositor === 'none'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-foreground">None (Sharp Only)</h4>
                    {compositor === 'none' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    No AI compositor - Use Sharp Workflow for pixel-perfect compositing only
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>100% pixel-perfect placement</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>No AI hallucination or distortion</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>Instant processing (no AI wait)</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>💰</span>
                      <span>$0.00 per image (FREE)</span>
                    </div>
                  </div>
                </div>

                {/* Freepik Seedream */}
                <div
                  onClick={() => handleCompositorChange('freepik')}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    compositor === 'freepik'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-foreground">Freepik Seedream 4</h4>
                    {compositor === 'freepik' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    ByteDance's Seedream 4 Edit API - Best for high-resolution output
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>4K resolution output</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>Superior overall detail</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-amber-600">⚠</span>
                      <span>Text may be distorted</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>💰</span>
                      <span>$0.02 per image</span>
                    </div>
                  </div>
                </div>

                {/* Nano Banana */}
                <div
                  onClick={() => handleCompositorChange('nanobanana')}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    compositor === 'nanobanana'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-foreground">Nano Banana (Gemini 2.5)</h4>
                    {compositor === 'nanobanana' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Google's Gemini 2.5 Flash Image - Best for text/label preservation
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>Cleaner, legible text</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>Realistic product placement</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>2048px resolution</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>💰</span>
                      <span>$0.03 per image</span>
                    </div>
                  </div>
                </div>

              </div>

              {compositorSuccess && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    ✓ Compositor changed successfully! Will apply to new jobs.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>Tip:</strong> Use Nano Banana for cost-effective compositing with good text preservation. Use Seedream for maximum 4K detail and quality. Use None (Sharp Only) for pixel-perfect placement without AI.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sharp Workflow Toggle */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-primary" />
                <CardTitle>Full Sharp Workflow</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Use template backgrounds + Sharp compositor for pixel-perfect compositing with no AI regeneration
              </p>

              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h4 className="font-semibold text-foreground mb-1">Enable Sharp Workflow</h4>
                  <p className="text-xs text-muted-foreground">
                    Template backgrounds + Sharp compositor (only $0.02 per image for background removal)
                  </p>
                </div>
                <button
                  onClick={handleSharpWorkflowToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    sharpWorkflowEnabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      sharpWorkflowEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Sharp Palette Button */}
              <button
                onClick={() => setShowSharpSettings(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <SettingsIcon className="w-4 h-4 text-primary" />
                <span className="font-medium text-foreground">Sharp Palette</span>
              </button>

              {sharpWorkflowSuccess && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    ✓ Sharp workflow {sharpWorkflowEnabled ? 'enabled' : 'disabled'} successfully!
                  </p>
                </div>
              )}

              {sharpWorkflowEnabled ? (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    <strong>Note:</strong> You must select a template in the Templates tab. Sharp workflow uses only template backgrounds (no AI generation).
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-green-600">✓</span>
                    <span>100% pixel-perfect text preservation</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-green-600">✓</span>
                    <span>No AI regeneration artifacts</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-green-600">✓</span>
                    <span>Uses templates from Templates tab</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>💰</span>
                    <span>Only $0.02 per image (background removal only)</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Background Workflow */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <CardTitle>Background Workflow</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose how backgrounds are generated and composited
              </p>

              <div className="space-y-3">
                {/* Cutout + Composite */}
                <div
                  onClick={() => handleSaveWorkflow('cutout_composite')}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    workflowPreference === 'cutout_composite'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      <h4 className="font-semibold text-foreground">Cutout + Composite</h4>
                    </div>
                    {workflowPreference === 'cutout_composite' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Precise 3-step process with pixel-perfect preservation
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>100% product preservation</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>Professional drop shadows</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>⏱</span>
                      <span>~40-60 seconds</span>
                    </div>
                  </div>
                </div>

              </div>

              {workflowSuccess && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    ✓ Workflow preference saved!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
      </div>

      {/* Sharp Settings Modal */}
      {showSharpSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold text-foreground">Sharp Compositor Settings</h2>
              </div>
              <button
                onClick={() => setShowSharpSettings(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Bottle Size */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Bottle Height (% of canvas)
                </label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={sharpSettings.bottleHeightPercent * 100}
                  onChange={(e) => setSharpSettings({
                    ...sharpSettings,
                    bottleHeightPercent: parseInt(e.target.value) / 100
                  })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>10%</span>
                  <span className="font-semibold text-foreground">{Math.round(sharpSettings.bottleHeightPercent * 100)}%</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Image Quality */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Image Quality
                </label>
                <input
                  type="range"
                  min="60"
                  max="100"
                  step="5"
                  value={sharpSettings.quality}
                  onChange={(e) => setSharpSettings({
                    ...sharpSettings,
                    quality: parseInt(e.target.value)
                  })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>60</span>
                  <span className="font-semibold text-foreground">{sharpSettings.quality}</span>
                  <span>100 (best)</span>
                </div>
              </div>

              {/* Output Format */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Output Format
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['jpeg', 'png', 'webp'] as const).map((format) => (
                    <button
                      key={format}
                      onClick={() => setSharpSettings({ ...sharpSettings, format })}
                      className={`px-4 py-2 rounded-md transition-all ${
                        sharpSettings.format === format
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-slate-800 text-foreground hover:bg-slate-700'
                      }`}
                    >
                      {format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gravity/Position */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Bottle Position
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['north', 'center', 'south'] as const).map((gravity) => (
                    <button
                      key={gravity}
                      onClick={() => setSharpSettings({ ...sharpSettings, gravity })}
                      className={`px-4 py-2 rounded-md transition-all ${
                        sharpSettings.gravity === gravity
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-slate-800 text-foreground hover:bg-slate-700'
                      }`}
                    >
                      {gravity.charAt(0).toUpperCase() + gravity.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sharpen */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Sharpen (optional)
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={sharpSettings.sharpen || 0}
                  onChange={(e) => setSharpSettings({
                    ...sharpSettings,
                    sharpen: parseFloat(e.target.value)
                  })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0 (off)</span>
                  <span className="font-semibold text-foreground">{sharpSettings.sharpen?.toFixed(1) || '0.0'}</span>
                  <span>10 (max)</span>
                </div>
              </div>

              {/* Gamma */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Gamma Correction (optional)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={sharpSettings.gamma || 1.0}
                  onChange={(e) => setSharpSettings({
                    ...sharpSettings,
                    gamma: parseFloat(e.target.value)
                  })}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0.5 (darker)</span>
                  <span className="font-semibold text-foreground">{sharpSettings.gamma?.toFixed(1) || '1.0'}</span>
                  <span>3.0 (brighter)</span>
                </div>
              </div>

              {/* Success Message */}
              {sharpSettingsSuccess && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    ✓ Sharp settings saved successfully! Will apply to new jobs.
                  </p>
                </div>
              )}

              {/* Info Box */}
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                  <strong>Tip:</strong> These settings control Sharp's image processing. Bottle size is the most important setting. Sharpen and Gamma are optional enhancements.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowSharpSettings(false)}
                className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleSaveSharpSettings();
                  setShowSharpSettings(false);
                }}
                className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
