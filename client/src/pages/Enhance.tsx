/**
 * Image Enhancement Page
 *
 * Standalone AI image upscaling using Real-ESRGAN via Replicate
 */

import { useState } from 'react';
import { ArrowUpIcon, SparklesIcon, Upload } from 'lucide-react';

interface Enhancement {
  id: string;
  status: string;
  scaleFactor: number;
  inputS3Key: string;
  outputS3Key: string | null;
  inputUrl: string | null;
  outputUrl: string | null;
  error: string | null;
  cost: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

export default function Enhance() {
  const [inputS3Key, setInputS3Key] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(4);
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [model, setModel] = useState<'real-esrgan' | 'clarity'>('clarity');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [enhancement, setEnhancement] = useState<Enhancement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'upload' | 's3key'>('upload');

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be less than 10MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUploadAndEnhance = async () => {
    if (!selectedFile) {
      setError('Please select an image file');
      return;
    }

    setIsUploading(true);
    setIsProcessing(true);
    setError(null);
    setEnhancement(null);

    try {
      // Step 1: Upload file to S3
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadResponse = await fetch('/api/upload-for-enhancement', {
        method: 'POST',
        body: formData
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      const uploadedS3Key = uploadData.s3Key;
      setIsUploading(false);

      // Step 2: Enhance the uploaded image
      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputS3Key: uploadedS3Key,
          scale,
          faceEnhance,
          model
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Enhancement failed');
      }

      // Get enhancement details
      const detailsResponse = await fetch(`/api/enhance/${data.enhancementId}`);
      const detailsData = await detailsResponse.json();

      if (detailsData.success) {
        setEnhancement(detailsData.enhancement);
      }

    } catch (err: any) {
      console.error('Enhancement error:', err);
      setError(err.message || 'Failed to enhance image');
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const handleEnhanceByS3Key = async () => {
    if (!inputS3Key.trim()) {
      setError('Please enter an S3 key');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setEnhancement(null);

    try {
      const response = await fetch('/api/enhance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputS3Key: inputS3Key.trim(),
          scale,
          faceEnhance,
          model
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Enhancement failed');
      }

      // Get enhancement details
      const detailsResponse = await fetch(`/api/enhance/${data.enhancementId}`);
      const detailsData = await detailsResponse.json();

      if (detailsData.success) {
        setEnhancement(detailsData.enhancement);
      }

    } catch (err: any) {
      console.error('Enhancement error:', err);
      setError(err.message || 'Failed to enhance image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnhance = inputMode === 'upload' ? handleUploadAndEnhance : handleEnhanceByS3Key;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Image Enhancement
        </h1>
        <p className="text-muted-foreground">
          AI-powered image upscaling with Clarity AI (better for text) or Real-ESRGAN (faster). Cost: ~$0.024 per image.
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-card rounded-lg border border-border p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Enhance Image</h2>

        {/* Input Mode Toggle */}
        <div className="mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setInputMode('upload')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                inputMode === 'upload'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Upload Image
            </button>
            <button
              onClick={() => setInputMode('s3key')}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                inputMode === 's3key'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Use S3 Key
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* File Upload or S3 Key Input */}
          {inputMode === 'upload' ? (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select Image
              </label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-12 h-12 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {selectedFile ? selectedFile.name : 'Click to upload or drag and drop'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    PNG, JPG, JPEG up to 10MB
                  </span>
                </label>
              </div>
              {previewUrl && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-foreground mb-2">Preview:</p>
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-sm h-auto rounded-lg border border-border"
                  />
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Input S3 Key
              </label>
              <input
                type="text"
                value={inputS3Key}
                onChange={(e) => setInputS3Key(e.target.value)}
                placeholder="e.g., originals/SKU123/abc123.jpg"
                className="w-full px-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* AI Model Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              AI Model
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setModel('clarity')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  model === 'clarity'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>Clarity AI</span>
                  <span className="text-xs opacity-80">Better for text & labels</span>
                </div>
              </button>
              <button
                onClick={() => setModel('real-esrgan')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  model === 'real-esrgan'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <span>Real-ESRGAN</span>
                  <span className="text-xs opacity-80">Faster, general purpose</span>
                </div>
              </button>
            </div>
          </div>

          {/* Scale Factor */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Scale Factor: {scale}x
            </label>
            <div className="flex gap-2">
              {[2, 4, 8].map((s) => (
                <button
                  key={s}
                  onClick={() => setScale(s)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    scale === s
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Face Enhancement Toggle (only for Real-ESRGAN) */}
          {model === 'real-esrgan' && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="faceEnhance"
                checked={faceEnhance}
                onChange={(e) => setFaceEnhance(e.target.checked)}
                className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary"
              />
              <label htmlFor="faceEnhance" className="text-sm font-medium text-foreground">
                Enable Face Enhancement
              </label>
            </div>
          )}

          {/* Enhance Button */}
          <button
            onClick={handleEnhance}
            disabled={isProcessing || isUploading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground" />
                Uploading...
              </>
            ) : isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-foreground" />
                Enhancing...
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                {inputMode === 'upload' ? 'Upload & Enhance' : 'Enhance Image'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive rounded-lg p-4 mb-6">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {enhancement && (
        <div className="bg-card rounded-lg border border-border p-6">
          <h2 className="text-xl font-semibold mb-4">Result</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Image */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Input ({enhancement.metadata?.inputWidth}x{enhancement.metadata?.inputHeight})
              </h3>
              {enhancement.inputUrl && (
                <img
                  src={enhancement.inputUrl}
                  alt="Input"
                  className="w-full h-auto rounded-lg border border-border"
                />
              )}
            </div>

            {/* Output Image */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Output ({enhancement.metadata?.outputWidth}x{enhancement.metadata?.outputHeight})
              </h3>
              {enhancement.outputUrl && (
                <div className="relative">
                  <img
                    src={enhancement.outputUrl}
                    alt="Output"
                    className="w-full h-auto rounded-lg border border-border"
                  />
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                    {scale}x
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium text-foreground capitalize">{enhancement.status}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Scale</p>
              <p className="font-medium text-foreground">{enhancement.scaleFactor}x</p>
            </div>
            <div>
              <p className="text-muted-foreground">Duration</p>
              <p className="font-medium text-foreground">
                {enhancement.metadata?.duration ? `${(enhancement.metadata.duration / 1000).toFixed(1)}s` : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Cost</p>
              <p className="font-medium text-foreground">${enhancement.cost.toFixed(4)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
