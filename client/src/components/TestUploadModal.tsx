import React, { useState } from 'react';
import Spinner from './Spinner';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: (jobId: string) => void;
};

export default function TestUploadModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<'form' | 'preview' | 'uploading'>('form');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sku, setSku] = useState('TEST-SKU-' + Math.random().toString(36).substring(7).toUpperCase());
  const [, setImageUrl] = useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setErr('Image size must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setErr('');

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
      setStep('preview');
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setErr('');
    setStep('uploading');

    try {
      // Step 1: Upload the file to a temporary server endpoint to get a URL
      const formData = new FormData();
      formData.append('file', selectedFile);

      // First, upload the image to get a temporary URL
      const uploadResponse = await fetch('/api/upload-test-image', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(`Image upload failed: ${uploadResponse.status} - ${errorData.error || uploadResponse.statusText}`);
      }

      const uploadResult = await uploadResponse.json();
      const tempImageUrl = uploadResult.url;

      if (!tempImageUrl) {
        throw new Error('No image URL returned from upload endpoint');
      }

      // Step 2: Calculate SHA256 hash of the file
      const fileBuffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
      const sha256 = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Step 3: Send webhook to the system
      const payload = {
        event: 'image_uploaded',
        sku: sku,
        imageUrl: tempImageUrl,
        sha256: sha256,
        takenAt: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(payload);

      // POST to webhook endpoint (no signature needed in dev mode)
      const webhookResponse = await fetch('/api/webhooks/3jms/images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payloadString,
      });

      if (!webhookResponse.ok) {
        const errorData = await webhookResponse.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Webhook failed: ${webhookResponse.status} - ${errorData.error || webhookResponse.statusText}`);
      }

      const result = await webhookResponse.json();

      if (!result.jobId) {
        throw new Error('No jobId returned from webhook');
      }

      // Success!
      onSuccess(result.jobId);

      // Reset form
      setSelectedFile(null);
      setPreview('');
      setSku('TEST-SKU-' + Math.random().toString(36).substring(7).toUpperCase());
      setStep('form');
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Upload failed');
      setStep('preview');
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('form');
    setErr('');
    setPreview('');
    setSelectedFile(null);
    setImageUrl('');
    onClose();
  };

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" style={overlay}>
      <div style={card}>
        <div style={header}>
          <strong>Test Image Upload (Simulate 3JMS Webhook)</strong>
          <button onClick={handleClose} aria-label="Close" style={closeBtn}>✕</button>
        </div>

        {err && <div style={{ color: 'crimson', marginBottom: 12, padding: 8, backgroundColor: '#fee', borderRadius: 4 }}>{err}</div>}

        {step === 'form' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                SKU (Product ID):
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g., PROD-SKU-001"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  color: '#000',
                  backgroundColor: '#fff',
                }}
              />
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                This simulates a 3JMS SKU. The system will create a job for this product.
              </p>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                Select Product Image:
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '2px dashed #d1d5db',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              />
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Select a product image (JPG, PNG). This will be sent to the pipeline.
              </p>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={handleClose} style={btnSecondary}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p style={{ marginBottom: 8, fontWeight: 500 }}>Image Preview:</p>
              <img
                src={preview}
                alt="preview"
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  objectFit: 'contain',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#6b7280' }}>
                <strong>SKU:</strong> {sku}
              </p>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                <strong>File:</strong> {selectedFile?.name}
              </p>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  setStep('form');
                  setPreview('');
                  setSelectedFile(null);
                }}
                style={btnSecondary}
              >
                Choose Different Image
              </button>
              <button onClick={handleUpload} disabled={loading} style={{...btn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8}}>
                {loading && <Spinner size={16} color="#ffffff" />}
                {loading ? 'Uploading...' : 'Trigger Processing'}
              </button>
            </div>
          </div>
        )}

        {step === 'uploading' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Spinner size={40} color="#3b82f6" />
            <p style={{ marginTop: 16, fontSize: 14, color: '#6b7280' }}>
              Uploading image and triggering webhook...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: 20,
  width: 520,
  maxWidth: '100%',
};

const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 20,
  cursor: 'pointer',
  padding: 4,
};

const btn: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: '#e5e7eb',
  color: '#374151',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 14,
};
