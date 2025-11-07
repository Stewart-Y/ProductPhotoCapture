/**
 * 3JMS Webhook Simulator Page
 *
 * Upload multiple images to simulate 3JMS webhook calls
 * Each image triggers a webhook that creates a job and processes through the full pipeline
 */

import { useState } from 'react';

const API_BASE = '/api';

export default function WebhookSimulator() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [webhookResults, setWebhookResults] = useState<any[]>([]);
  const [processing, setProcessing] = useState(false);

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(file =>
        file.type.startsWith('image/')
      );
      setSelectedFiles(files);
    }
  };

  const handleSubmitWebhooks = async () => {
    if (selectedFiles.length === 0) return;

    setProcessing(true);
    setWebhookResults([]);

    try {
      for (const file of selectedFiles) {
        // Generate SHA256 hash
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Upload file first
        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await fetch(`${API_BASE}/upload-test-image`, {
          method: 'POST',
          body: formData
        });

        if (!uploadRes.ok) {
          setWebhookResults(prev => [...prev, {
            filename: file.name,
            status: 'error',
            error: 'Failed to upload image'
          }]);
          continue;
        }

        const uploadData = await uploadRes.json();

        // Simulate webhook call
        const webhookPayload = {
          event: 'image.uploaded',
          sku: file.name.replace(/\.[^/.]+$/, '').toUpperCase(), // filename without extension
          imageUrl: uploadData.url,
          sha256: sha256,
          takenAt: new Date().toISOString()
        };

        const webhookRes = await fetch(`${API_BASE}/webhooks/3jms/images`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(webhookPayload)
        });

        const webhookData = await webhookRes.json();

        setWebhookResults(prev => [...prev, {
          filename: file.name,
          sku: webhookPayload.sku,
          status: webhookRes.ok ? 'success' : 'error',
          jobId: webhookData.jobId,
          data: webhookData
        }]);
      }
    } catch (error) {
      console.error('Error processing webhooks:', error);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">3JMS Webhook Simulator</h1>
          <p className="text-muted-foreground mt-1">
            Test the full pipeline by simulating webhook calls from 3JMS
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Upload Images</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Upload multiple images to simulate 3JMS webhook calls. Each image will trigger a webhook
              that creates a job and processes it through the full pipeline.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Select Images</label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFolderSelect}
                  className="w-full bg-background text-foreground border border-border rounded-md px-3 py-2 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Select multiple image files to simulate webhooks
                </p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                  <p className="text-sm font-medium mb-2">{selectedFiles.length} images selected:</p>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {selectedFiles.map((file, idx) => (
                        <li key={idx} className="truncate">{file.name} ({(file.size / 1024).toFixed(1)} KB)</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmitWebhooks}
                disabled={selectedFiles.length === 0 || processing}
                className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
              >
                {processing ? 'Processing Webhooks...' : `Submit ${selectedFiles.length} Webhook(s)`}
              </button>
            </div>
          </div>

          {/* Webhook Results */}
          {webhookResults.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4">Webhook Results</h3>
              <div className="space-y-3">
                {webhookResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`border rounded-lg p-4 ${
                      result.status === 'success' ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium">{result.filename}</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        result.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}>
                        {result.status}
                      </span>
                    </div>
                    {result.sku && <p className="text-sm text-muted-foreground">SKU: {result.sku}</p>}
                    {result.jobId && (
                      <a
                        href={`/jobs/${result.jobId}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View Job: {result.jobId}
                      </a>
                    )}
                    {result.error && <p className="text-sm text-red-400">Error: {result.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
