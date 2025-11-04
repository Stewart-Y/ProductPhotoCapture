import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui';
import { Sparkles, Zap, Target, Plus, X, Trash2 } from 'lucide-react';

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

  // Load custom prompts and workflow preference on mount
  useEffect(() => {
    fetchCustomPrompts();
    fetchWorkflowPreference();
  }, []);

  const fetchCustomPrompts = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/custom-prompts');
      const data = await response.json();

      if (data.success) {
        setCustomPrompts(data.prompts);

        // Fetch the currently selected prompt ID from settings
        const selectedResponse = await fetch('http://localhost:4000/api/settings/selected-prompt');
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
      const response = await fetch('http://localhost:4000/api/settings/workflow');
      if (response.ok) {
        const data = await response.json();
        setWorkflowPreference(data.workflow);
      }
    } catch (error) {
      console.error('Error fetching workflow preference:', error);
    }
  };

  const handleAddPrompt = async () => {
    if (!newPromptTitle.trim() || !newPromptText.trim()) return;

    setIsSavingPrompt(true);
    setPromptSuccess(false);

    try {
      const response = await fetch('http://localhost:4000/api/custom-prompts', {
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
      const response = await fetch(`http://localhost:4000/api/custom-prompts/${promptId}`, {
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
      await fetch('http://localhost:4000/api/settings/selected-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId: newPromptId })
      });
      console.log('Selected prompt saved:', newPromptId);
    } catch (error) {
      console.error('Error saving selected prompt:', error);
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

  const selectedPrompt = customPrompts.find(p => p.id === selectedPromptId);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure AI prompts and workflow preferences
        </p>
      </div>

      {/* Custom Background Prompts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle>Background Prompts</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Create and manage custom prompts for background generation. Select a prompt from the dropdown or create a new one.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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
              Add Prompt
            </button>
          </div>

          {/* Selected Prompt Display */}
          {selectedPrompt && (
            <div className="bg-muted/50 rounded-md p-4 border border-border space-y-3">
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
              <p className="text-sm text-muted-foreground">{selectedPrompt.prompt}</p>
              <p className="text-xs text-muted-foreground">
                Used {selectedPrompt.used_count} time(s) • Created {new Date(selectedPrompt.created_at).toLocaleDateString()}
              </p>
            </div>
          )}

          {promptSuccess && (
            <p className="text-xs text-green-600">Prompt saved successfully!</p>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              How Background Prompts Work
            </h4>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Create custom prompts with descriptive names for easy selection</li>
              <li>• Prompts describe the background scene/theme for AI generation</li>
              <li>• Default prompt is provided but you can create as many as needed</li>
              <li>• Selected prompt will be used for new jobs (doesn't affect existing jobs)</li>
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
