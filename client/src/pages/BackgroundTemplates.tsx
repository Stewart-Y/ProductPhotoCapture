/**
 * Background Templates Page
 *
 * Manage reusable background templates for consistent product compositing
 * Users can create, view, select, and archive background templates
 */

import React, { useState, useEffect } from 'react';

interface TemplateAsset {
  id: number;
  template_id: string;
  variant: number;
  s3_key: string;
  s3_url: string;
  s3_url_expires_at: string;
  width: number;
  height: number;
  format: string;
  size_bytes: number;
  created_at: string;
  selected: boolean;
}

interface Template {
  id: string;
  name: string;
  theme: string;
  prompt: string;
  status: 'active' | 'generating' | 'archived';
  created_at: string;
  updated_at: string;
  used_count: number;
  variant_count: number;
  assets?: TemplateAsset[];
}

interface CustomPrompt {
  id: string;
  title: string;
  prompt: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  used_count: number;
}

interface CreateTemplateForm {
  name: string;
  promptId: string;
  variantCount: number;
}

interface CreatePromptForm {
  title: string;
  prompt: string;
}

const API_BASE = '/api';

export default function BackgroundTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState<CreateTemplateForm>({
    name: '',
    promptId: '',
    variantCount: 3
  });

  const [promptForm, setPromptForm] = useState<CreatePromptForm>({
    title: '',
    prompt: ''
  });

  const [uploadForm, setUploadForm] = useState({
    title: '',
    file: null as File | null
  });

  const [uploading, setUploading] = useState(false);

  // Fetch templates and prompts on mount
  useEffect(() => {
    fetchTemplates();
    fetchActiveTemplate();
    fetchCustomPrompts();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates?status=active`);
      const data = await response.json();

      if (data.success) {
        setTemplates(data.templates);
      } else {
        setError('Failed to load templates');
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings/active-template`);
      const data = await response.json();

      if (data.success && data.activeTemplate) {
        setActiveTemplateId(data.activeTemplate.id);
      }
    } catch (err) {
      console.error('Failed to fetch active template:', err);
    }
  };

  const fetchCustomPrompts = async () => {
    try {
      const response = await fetch(`${API_BASE}/custom-prompts`);
      const data = await response.json();

      if (data.success) {
        setCustomPrompts(data.prompts);
        // Set default prompt if none selected
        if (!createForm.promptId && data.prompts.length > 0) {
          const defaultPrompt = data.prompts.find((p: CustomPrompt) => p.is_default);
          setCreateForm(prev => ({ ...prev, promptId: defaultPrompt?.id || data.prompts[0].id }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch custom prompts:', err);
    }
  };

  const fetchTemplateDetails = async (templateId: string) => {
    try {
      const response = await fetch(`${API_BASE}/templates/${templateId}`);
      const data = await response.json();

      if (data.success) {
        setSelectedTemplate(data.template);
      }
    } catch (err) {
      console.error('Failed to fetch template details:', err);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      // Find the selected prompt
      const selectedPrompt = customPrompts.find(p => p.id === createForm.promptId);
      if (!selectedPrompt) {
        setError('Please select a prompt');
        return;
      }

      const response = await fetch(`${API_BASE}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          customPrompt: selectedPrompt.prompt,
          variantCount: createForm.variantCount
        })
      });

      const data = await response.json();

      if (data.success) {
        setShowCreateModal(false);
        setCreateForm({
          name: '',
          promptId: customPrompts.find(p => p.is_default)?.id || customPrompts[0]?.id || '',
          variantCount: 3
        });
        fetchTemplates(); // Refresh list
      } else {
        setError(data.error || 'Failed to create template');
      }
    } catch (err) {
      console.error('Failed to create template:', err);
      setError('Failed to create template');
    } finally {
      setCreating(false);
    }
  };

  const handleSetActiveTemplate = async (templateId: string | null) => {
    try {
      const response = await fetch(`${API_BASE}/settings/active-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId })
      });

      const data = await response.json();

      if (data.success) {
        setActiveTemplateId(templateId);
      } else {
        setError('Failed to set active template');
      }
    } catch (err) {
      console.error('Failed to set active template:', err);
      setError('Failed to set active template');
    }
  };

  const handleArchiveTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to archive this template?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/templates/${templateId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        fetchTemplates(); // Refresh list
        if (activeTemplateId === templateId) {
          setActiveTemplateId(null);
        }
      } else {
        setError('Failed to archive template');
      }
    } catch (err) {
      console.error('Failed to archive template:', err);
      setError('Failed to archive template');
    }
  };

  const handleCreatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/custom-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptForm)
      });

      const data = await response.json();

      if (data.success) {
        setShowPromptModal(false);
        setPromptForm({ title: '', prompt: '' });
        await fetchCustomPrompts(); // Refresh prompts
        // Set the newly created prompt as selected
        setCreateForm(prev => ({ ...prev, promptId: data.prompt.id }));
      } else {
        setError(data.error || 'Failed to create prompt');
      }
    } catch (err) {
      console.error('Failed to create prompt:', err);
      setError('Failed to create prompt');
    } finally {
      setCreating(false);
    }
  };

  const handleUploadTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadForm.file) {
      setError('Please select an image file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('title', uploadForm.title);
      formData.append('image', uploadForm.file);

      const response = await fetch(`${API_BASE}/templates/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setShowUploadModal(false);
        setUploadForm({ title: '', file: null });
        fetchTemplates(); // Refresh list
      } else {
        setError(data.error || 'Failed to upload template');
      }
    } catch (err) {
      console.error('Failed to upload template:', err);
      setError('Failed to upload template');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Background Templates</h1>
            <p className="text-muted-foreground mt-1">
              Create and manage reusable background templates for consistent product compositing
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition"
            >
              Upload Background
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition"
            >
              + Create Template
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-md mb-4">
            {error}
            <button onClick={() => setError(null)} className="ml-4 underline">Dismiss</button>
          </div>
        )}

        {/* Active Template Info */}
        {activeTemplateId && (
          <div className="bg-primary/10 border border-primary px-4 py-3 rounded-md mb-6">
            <p className="text-sm">
              <strong>Active Template:</strong> {templates.find(t => t.id === activeTemplateId)?.name || activeTemplateId}
              <button
                onClick={() => handleSetActiveTemplate(null)}
                className="ml-4 text-xs underline hover:no-underline"
              >
                Clear Active Template
              </button>
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading templates...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && templates.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
            <p className="text-muted-foreground mb-4">No templates yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-md hover:opacity-90 transition"
            >
              Create Your First Template
            </button>
          </div>
        )}

        {/* Templates Grid */}
        {!loading && templates.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                isActive={template.id === activeTemplateId}
                onSetActive={() => handleSetActiveTemplate(template.id)}
                onArchive={() => handleArchiveTemplate(template.id)}
                onViewDetails={() => fetchTemplateDetails(template.id)}
              />
            ))}
          </div>
        )}

        {/* Create Template Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Create Background Template</h2>

              <form onSubmit={handleCreateTemplate}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-foreground">Template Name</label>
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Christmas Backgrounds, Kitchen Counter"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2 text-foreground">Background Prompt</label>
                    {customPrompts.length > 1 ? (
                      <div className="space-y-2">
                        <select
                          value={createForm.promptId}
                          onChange={(e) => setCreateForm({ ...createForm, promptId: e.target.value })}
                          className="w-full bg-slate-800 text-white border-2 border-primary rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary text-base font-medium"
                        >
                          {customPrompts.map(prompt => (
                            <option key={prompt.id} value={prompt.id}>
                              {prompt.title}
                            </option>
                          ))}
                        </select>
                        {customPrompts.find(p => p.id === createForm.promptId && !p.is_default) && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm('Delete this custom prompt?')) {
                                try {
                                  const response = await fetch(`${API_BASE}/custom-prompts/${createForm.promptId}`, {
                                    method: 'DELETE'
                                  });
                                  if (response.ok) {
                                    await fetchCustomPrompts();
                                    const defaultPrompt = customPrompts.find(p => p.is_default);
                                    if (defaultPrompt) {
                                      setCreateForm(prev => ({ ...prev, promptId: defaultPrompt.id }));
                                    }
                                  }
                                } catch (err) {
                                  console.error('Failed to delete prompt:', err);
                                }
                              }
                            }}
                            className="w-full bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition font-medium text-sm"
                          >
                            Delete Selected Prompt
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Select a saved prompt or create a new one below
                        </p>
                      </div>
                    ) : (
                      <div className="w-full bg-slate-800 text-white border-2 border-slate-700 rounded-md px-3 py-2 text-base font-medium">
                        Custom Prompt
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPromptModal(true)}
                    className="w-full bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium text-sm"
                  >
                    + Add New Prompt
                  </button>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-foreground">
                      Number of Variants (1-5)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={createForm.variantCount}
                      onChange={(e) => setCreateForm({ ...createForm, variantCount: parseInt(e.target.value) })}
                      className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Generate multiple variants to choose from
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 bg-red-900/30 border border-red-600 rounded-lg p-3">
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setError(null);
                    }}
                    className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
                    disabled={creating}
                  >
                    {creating ? 'Creating...' : 'Create Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add New Prompt Modal */}
        {showPromptModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Add New Prompt</h2>

              <form onSubmit={handleCreatePrompt}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-foreground">Prompt Title</label>
                    <input
                      type="text"
                      value={promptForm.title}
                      onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })}
                      className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., Summer Beach Scene"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-foreground">Prompt Description</label>
                    <textarea
                      value={promptForm.prompt}
                      onChange={(e) => setPromptForm({ ...promptForm, prompt: e.target.value })}
                      className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={5}
                      placeholder="Describe the background scene in detail..."
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Describe the background, lighting, atmosphere, and style you want
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 bg-red-900/30 border border-red-600 rounded-lg p-3">
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPromptModal(false);
                      setError(null);
                    }}
                    className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
                    disabled={creating}
                  >
                    {creating ? 'Saving...' : 'Save Prompt'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Upload Background Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-2xl font-bold mb-4 text-foreground">Upload Background Image</h2>

              <form onSubmit={handleUploadTemplate}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-foreground">Template Title</label>
                    <input
                      type="text"
                      value={uploadForm.title}
                      onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                      className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="e.g., White Studio Background"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1 text-foreground">Background Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setUploadForm({ ...uploadForm, file });
                      }}
                      className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload a background image to use as a template (JPG, PNG, etc.)
                    </p>
                  </div>

                  {uploadForm.file && (
                    <div className="border border-border rounded-md p-3 bg-background">
                      <p className="text-sm text-foreground">
                        <strong>Selected:</strong> {uploadForm.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Size: {(uploadForm.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mt-4 bg-red-900/30 border border-red-600 rounded-lg p-3">
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadForm({ title: '', file: null });
                      setError(null);
                    }}
                    className="flex-1 bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition font-medium"
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload Template'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Template Details Modal */}
        {selectedTemplate && (
          <TemplateDetailsModal
            template={selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
          />
        )}
      </div>
    </div>
  );
}

// Template Card Component
interface TemplateCardProps {
  template: Template;
  isActive: boolean;
  onSetActive: () => void;
  onArchive: () => void;
  onViewDetails: () => void;
}

function TemplateCard({ template, isActive, onSetActive, onArchive, onViewDetails }: TemplateCardProps) {
  return (
    <div className={`border rounded-lg p-4 ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold">{template.name}</h3>
          <p className="text-xs text-muted-foreground capitalize">{template.theme}</p>
        </div>
        {isActive && (
          <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded">Active</span>
        )}
        {template.status === 'generating' && (
          <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded">Generating...</span>
        )}
      </div>

      <div className="text-sm text-muted-foreground mb-3">
        <p>{template.variant_count} variant(s)</p>
        <p>Used {template.used_count} time(s)</p>
      </div>

      <div className="flex gap-2">
        {!isActive && template.status === 'active' && (
          <button
            onClick={onSetActive}
            className="flex-1 bg-primary text-primary-foreground text-sm px-3 py-1.5 rounded hover:opacity-90 transition"
          >
            Set Active
          </button>
        )}
        <button
          onClick={onViewDetails}
          className="flex-1 bg-secondary text-secondary-foreground text-sm px-3 py-1.5 rounded hover:opacity-90 transition"
        >
          View Details
        </button>
        <button
          onClick={onArchive}
          className="bg-destructive text-destructive-foreground text-sm px-3 py-1.5 rounded hover:opacity-90 transition"
        >
          Archive
        </button>
      </div>
    </div>
  );
}

// Template Details Modal Component
interface TemplateDetailsModalProps {
  template: Template;
  onClose: () => void;
}

function TemplateDetailsModal({ template, onClose }: TemplateDetailsModalProps) {
  const [localTemplate, setLocalTemplate] = useState(template);

  const handleToggleVariant = async (variantId: number) => {
    try {
      const response = await fetch(`${API_BASE}/templates/${template.id}/variants/${variantId}/toggle`, {
        method: 'PATCH'
      });

      if (response.ok) {
        // Refresh template data
        const refreshResponse = await fetch(`${API_BASE}/templates/${template.id}`);
        const data = await refreshResponse.json();
        if (data.success) {
          setLocalTemplate(data.template);
        }
      }
    } catch (err) {
      console.error('Failed to toggle variant:', err);
    }
  };

  const selectedCount = localTemplate.assets?.filter(a => a.selected).length || 0;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border-2 border-slate-700 rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{localTemplate.name}</h2>
            <p className="text-sm text-slate-300 capitalize">Theme: {localTemplate.theme}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold leading-none"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-white"><strong className="text-amber-500">Prompt:</strong> {localTemplate.prompt}</p>
          <p className="text-sm text-white mt-2"><strong className="text-amber-500">Status:</strong> <span className="capitalize">{localTemplate.status}</span></p>
          <p className="text-sm text-white mt-1"><strong className="text-amber-500">Used:</strong> {localTemplate.used_count} time(s)</p>
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white text-lg">
            Template Variants ({localTemplate.assets?.length || 0})
          </h3>
          <span className="text-sm text-amber-500 font-medium">
            {selectedCount} selected
          </span>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          Click variants to toggle selection. When this template is active, only selected variants will be used for jobs.
        </p>

        {localTemplate.assets && localTemplate.assets.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {localTemplate.assets.map(asset => (
              <div
                key={asset.id}
                className={`border-2 rounded-lg overflow-hidden bg-slate-800 cursor-pointer transition ${
                  asset.selected
                    ? 'border-amber-500 ring-2 ring-amber-500/50'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
                onClick={() => handleToggleVariant(asset.id)}
              >
                <div className="relative">
                  <img
                    src={asset.s3_url}
                    alt={`Variant ${asset.variant}`}
                    className="w-full h-48 object-cover"
                  />
                  {asset.selected && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                      ✓
                    </div>
                  )}
                </div>
                <div className="p-2 bg-slate-800">
                  <p className="text-xs text-slate-300 font-semibold">Variant {asset.variant}</p>
                  <p className="text-xs text-slate-400">
                    {asset.width}×{asset.height} • {(asset.size_bytes / 1024).toFixed(1)}KB
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-slate-400 py-8 bg-slate-800 rounded-lg">No variants generated yet</p>
        )}

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full bg-slate-700 text-white px-4 py-2 rounded-md hover:bg-slate-600 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
