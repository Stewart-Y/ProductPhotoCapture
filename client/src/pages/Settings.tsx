import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { Sparkles, Zap, Target, Plus, X, Trash2, Cpu } from 'lucide-react';

interface CustomPrompt {
  id: string;
  title: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  used_count: number;
}

export const Settings: React.FC = () => {
  // Custom prompts state
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [showAddPromptModal, setShowAddPromptModal] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptSuccess, setPromptSuccess] = useState(false);

  // Workflow preference state
  const [workflowPreference, setWorkflowPreference] = useState<'cutout_composite' | 'seedream_edit'>('cutout_composite');
  const [, setIsSavingWorkflow] = useState(false);
  const [workflowSuccess, setWorkflowSuccess] = useState(false);

  // Compositor preference state
  const [compositor, setCompositor] = useState<'freepik' | 'nanobanana'>('freepik');
  const [compositorSuccess, setCompositorSuccess] = useState(false);

  // Load settings on mount
  useEffect(() => {
    fetchCustomPrompts();
    fetchWorkflowPreference();
    fetchCompositor();
  }, []);

  const fetchCustomPrompts = async () => {
    try {
      const response = await fetch('/api/custom-prompts');
      const data = await response.json();

      if (data.success) {
        setCustomPrompts(data.prompts);

        // Fetch the currently selected prompt ID from settings
        const selectedResponse = await fetch('/api/settings/selected-prompt');
        const selectedData = await selectedResponse.json();

        if (selectedData.success && selectedData.promptId) {
          // Check if the selected prompt still exists
          const promptExists = data.prompts.find((p: CustomPrompt) => p.id === selectedData.promptId);
          if (promptExists) {
            setSelectedPromptId(selectedData.promptId);
            return;
          }
        }

        // Fallback: Set default prompt as selected if available
        const defaultPrompt = data.prompts.find((p: CustomPrompt) => p.is_default);
        if (defaultPrompt) {
          setSelectedPromptId(defaultPrompt.id);
        } else if (data.prompts.length > 0) {
          setSelectedPromptId(data.prompts[0].id);
        }
      }
    } catch (error) {
      console.error('Error fetching custom prompts:', error);
    }
  };

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

  const handleAddPrompt = async () => {
    if (!newPromptTitle.trim() || !newPromptText.trim()) return;

    setIsSavingPrompt(true);
    setPromptSuccess(false);

    try {
      const response = await fetch('/api/custom-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPromptTitle.trim(),
          prompt: newPromptText.trim()
        })
      });

      const data = await response.json();

      if (data.success) {
        await fetchCustomPrompts();
        setSelectedPromptId(data.prompt.id);
        setShowAddPromptModal(false);
        setNewPromptTitle('');
        setNewPromptText('');
        setPromptSuccess(true);
        setTimeout(() => setPromptSuccess(false), 3000);
      }
    } catch (error) {
      console.error('Error adding prompt:', error);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;

    try {
      const response = await fetch(`/api/custom-prompts/${promptId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchCustomPrompts();
        // Select default prompt if deleted the selected one
        if (selectedPromptId === promptId) {
          const defaultPrompt = customPrompts.find(p => p.is_default && p.id !== promptId);
          if (defaultPrompt) {
            setSelectedPromptId(defaultPrompt.id);
          }
        }
      }
    } catch (error) {
      console.error('Error deleting prompt:', error);
    }
  };

  const handlePromptChange = async (newPromptId: string) => {
    setSelectedPromptId(newPromptId);

    // Save the selected prompt ID to the backend
    try {
      await fetch('/api/settings/selected-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId: newPromptId })
      });
    } catch (error) {
      console.error('Error saving selected prompt:', error);
    }
  };

  const handleSaveWorkflow = async (newWorkflow: 'cutout_composite' | 'seedream_edit') => {
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

  const handleCompositorChange = async (newCompositor: 'freepik' | 'nanobanana') => {
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

  const selectedPrompt = customPrompts.find(p => p.id === selectedPromptId);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure AI models, background prompts, and workflow preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
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
                  <strong>Tip:</strong> Use Nano Banana for products with labels/text. Use Seedream for maximum detail.
                </p>
              </div>
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

                {/* AI Edit */}
                <div
                  onClick={() => handleSaveWorkflow('seedream_edit')}
                  className={`border rounded-lg p-4 cursor-pointer transition-all ${
                    workflowPreference === 'seedream_edit'
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      <h4 className="font-semibold text-foreground">AI Edit (Fast)</h4>
                    </div>
                    {workflowPreference === 'seedream_edit' && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Single-step AI background replacement
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-green-600">✓</span>
                      <span>Natural lighting & shadows</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-amber-600">⚠</span>
                      <span>~95% product preservation</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>⏱</span>
                      <span>~20-30 seconds</span>
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

        {/* Right Column */}
        <div className="space-y-6">
          {/* Background Prompts */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <CardTitle>Background Prompts</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create and manage custom prompts for background generation
              </p>

              {/* Dropdown and Add Button */}
              <div className="flex gap-2">
                <select
                  value={selectedPromptId}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {customPrompts.length === 0 && (
                    <option value="">No prompts available</option>
                  )}
                  {customPrompts.map(prompt => (
                    <option key={prompt.id} value={prompt.id}>
                      {prompt.title} {prompt.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowAddPromptModal(true)}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Selected Prompt Display */}
              {selectedPrompt && (
                <div className="bg-muted/50 rounded-md p-4 border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{selectedPrompt.title}</p>
                    {!selectedPrompt.is_default && (
                      <button
                        onClick={() => handleDeletePrompt(selectedPrompt.id)}
                        className="text-red-500 hover:text-red-700 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{selectedPrompt.prompt}</p>
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    Used {selectedPrompt.used_count}× • {new Date(selectedPrompt.created_at).toLocaleDateString()}
                  </p>
                </div>
              )}

              {promptSuccess && (
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                  <p className="text-xs text-green-800 dark:text-green-200">
                    ✓ Prompt saved successfully!
                  </p>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                  <strong>How it works:</strong> Describe the scene, lighting, and atmosphere for AI background generation. Selected prompt applies to new jobs.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Prompt Modal */}
      {showAddPromptModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-foreground">Add Custom Prompt</h2>
              <button
                onClick={() => {
                  setShowAddPromptModal(false);
                  setNewPromptTitle('');
                  setNewPromptText('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-foreground">
                  Prompt Name
                </label>
                <input
                  type="text"
                  value={newPromptTitle}
                  onChange={(e) => setNewPromptTitle(e.target.value)}
                  placeholder="e.g., Halloween Scene, Luxury Marble"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-foreground">
                  Prompt Text
                </label>
                <textarea
                  value={newPromptText}
                  onChange={(e) => setNewPromptText(e.target.value)}
                  placeholder="Describe the background scene in detail..."
                  rows={5}
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Describe the background, lighting, atmosphere, and style you want
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowAddPromptModal(false);
                  setNewPromptTitle('');
                  setNewPromptText('');
                }}
                className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium"
                disabled={isSavingPrompt}
              >
                Cancel
              </button>
              <button
                onClick={handleAddPrompt}
                disabled={!newPromptTitle.trim() || !newPromptText.trim() || isSavingPrompt}
                className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
              >
                {isSavingPrompt ? 'Saving...' : 'Add Prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
