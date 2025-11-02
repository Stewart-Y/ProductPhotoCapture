import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useJob, useRetryJob, useFailJob, usePresignedUrl } from '../hooks';
import { Button, Card, CardContent, CardHeader, CardTitle, StatusBadge, Input } from '../components/ui';
import { formatCurrency, formatDuration, formatRelativeTime } from '../lib/utils';
import { AlertCircle, Copy, Check, Download, ExternalLink, Image as ImageIcon } from 'lucide-react';

const STEPS = ['NEW', 'BG_REMOVED', 'BACKGROUND_READY', 'COMPOSITED', 'DERIVATIVES', 'SHOPIFY_PUSH', 'DONE'];

export const JobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [copied, setCopied] = useState<string | null>(null);
  const [failReason, setFailReason] = useState('');
  const [showFailDialog, setShowFailDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'original' | 'cutout' | 'backgrounds' | 'composites' | 'derivatives'>('original');

  const { data: jobData, isLoading } = useJob(id);
  const retryJob = useRetryJob();
  const failJobMutation = useFailJob();

  const job = jobData?.job;
  const currentStepIndex = job && job.status ? STEPS.indexOf(job.status as any) : -1;

  const handleCopyField = (field: string, value: string | null) => {
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleFail = () => {
    if (job && job.id && failReason) {
      failJobMutation.mutate({ id: job.id, reason: failReason });
      setShowFailDialog(false);
      setFailReason('');
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!job) {
    return <div className="p-6">Job not found</div>;
  }

  // Ensure job has required properties
  const safeJob = {
    id: job.id || '',
    sku: job.sku || '',
    status: job.status || 'UNKNOWN',
    theme: job.theme || '',
    source_url: job.source_url || null,
    s3_cutout_key: job.s3_cutout_key || null,
    s3_mask_key: job.s3_mask_key || null,
    s3_bg_keys: job.s3_bg_keys || null,
    s3_composite_keys: job.s3_composite_keys || null,
    s3_derivative_keys: job.s3_derivative_keys || null,
    cost_usd: job.cost_usd || 0,
    created_at: job.created_at || '',
    completed_at: job.completed_at || null,
    attempt: job.attempt || 0,
    error_code: job.error_code || null,
    error_message: job.error_message || null,
    download_ms: job.download_ms || null,
    segmentation_ms: job.segmentation_ms || null,
    backgrounds_ms: job.backgrounds_ms || null,
    compositing_ms: job.compositing_ms || null,
    derivatives_ms: job.derivatives_ms || null,
    manifest_ms: job.manifest_ms || null,
    img_sha256: job.img_sha256 || '',
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{safeJob.sku}</h1>
          <p className="text-muted-foreground mt-1">
            Job ID: <span className="font-mono">{safeJob.id}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {safeJob.status === 'FAILED' && (
            <Button
              variant="outline"
              onClick={() => retryJob.mutate(safeJob.id)}
              disabled={retryJob.isPending}
            >
              Retry
            </Button>
          )}
          {safeJob.status !== 'DONE' && safeJob.status !== 'FAILED' && (
            <Button
              variant="destructive"
              onClick={() => setShowFailDialog(true)}
            >
              Fail Job
            </Button>
          )}
        </div>
      </div>

      {/* Step Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step} className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold
                    ${index < currentStepIndex ? 'bg-green-500 text-white' :
                      index === currentStepIndex ? 'bg-blue-500 text-white' :
                      'bg-muted text-muted-foreground'}`}
                >
                  {index < currentStepIndex ? '✓' : index + 1}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">{step.replace(/_/g, ' ')}</p>
                {index < STEPS.length - 1 && (
                  <div
                    className={`h-1 w-full mt-2 ${
                      index < currentStepIndex ? 'bg-green-500' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Image Transformation Viewer */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              <CardTitle>Image Transformation Pipeline</CardTitle>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-2 mt-4 border-b">
            <button
              onClick={() => setActiveTab('original')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'original'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              📥 Original
            </button>
            <button
              onClick={() => setActiveTab('cutout')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'cutout'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              ✂️ Cutout & Mask
            </button>
            <button
              onClick={() => setActiveTab('backgrounds')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'backgrounds'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              🎨 Backgrounds (2)
            </button>
            <button
              onClick={() => setActiveTab('composites')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'composites'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              🖼️ Composites (2)
            </button>
            <button
              onClick={() => setActiveTab('derivatives')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'derivatives'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              📐 Derivatives (18)
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {activeTab === 'original' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Original image from 3JMS</p>
              {job.source_url ? (
                <div className="space-y-4">
                  <div className="bg-muted rounded-lg p-4 flex items-center justify-center min-h-[300px]">
                    <img
                      src={job.source_url}
                      alt="Original"
                      className="max-h-96 max-w-full object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <div className="hidden text-muted-foreground">Image failed to load</div>
                  </div>
                  <div className="flex gap-2">
                    <a href={job.source_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" className="w-full" size="sm">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in New Tab
                      </Button>
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No source image URL available</p>
              )}
            </div>
          )}

          {activeTab === 'cutout' && <CutoutMaskTab jobId={safeJob.id} job={safeJob} />}

          {activeTab === 'backgrounds' && (
            <div className="space-y-4">
              {safeJob.s3_bg_keys && Array.isArray(safeJob.s3_bg_keys) ? (
                <div className="grid grid-cols-2 gap-4">
                  {safeJob.s3_bg_keys.map((key: string, i: number) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Background {i + 1}</p>
                      <div className="bg-muted rounded-lg p-2 min-h-[200px] flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">{key.split('/').pop()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Backgrounds not yet generated</p>
              )}
            </div>
          )}

          {activeTab === 'composites' && (
            <div className="space-y-4">
              {safeJob.s3_composite_keys && Array.isArray(safeJob.s3_composite_keys) ? (
                <div className="grid grid-cols-2 gap-4">
                  {safeJob.s3_composite_keys.map((key: string, i: number) => (
                    <div key={i}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Composite {i + 1}</p>
                      <div className="bg-muted rounded-lg p-2 min-h-[200px] flex items-center justify-center">
                        <p className="text-xs text-muted-foreground">{key.split('/').pop()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Composites not yet generated</p>
              )}
            </div>
          )}

          {activeTab === 'derivatives' && (
            <div className="space-y-4">
              {safeJob.s3_derivative_keys && Array.isArray(safeJob.s3_derivative_keys) ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {safeJob.s3_derivative_keys.map((key: string, i: number) => (
                    <div key={i} className="text-xs">
                      <div className="bg-muted rounded p-2 min-h-[80px] flex items-center justify-center">
                        <p className="text-muted-foreground text-center break-words">{key.split('/').pop()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">Derivatives not yet generated</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Timeline & Costs */}
        <div className="space-y-6">
          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-mono text-sm">{new Date(job.created_at).toLocaleString()}</p>
                </div>
                {job.completed_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="font-mono text-sm">{new Date(job.completed_at).toLocaleString()}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-mono text-sm">{formatRelativeTime(job.updated_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Costs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Costs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm">Total Cost</span>
                <span className="font-semibold">{formatCurrency(job.cost_usd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Attempts</span>
                <span className="font-semibold">{job.attempt}</span>
              </div>
            </CardContent>
          </Card>

          {/* Errors */}
          {job.status === 'FAILED' && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-300">
                  <AlertCircle className="w-4 h-4" />
                  Error
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Code</p>
                  <p className="font-mono text-sm font-semibold text-red-700 dark:text-red-300">
                    {job.error_code || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Message</p>
                  <p className="text-sm text-red-700 dark:text-red-300 break-words">
                    {job.error_message || 'N/A'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Center: Metadata */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <StatusBadge status={job.status} className="mt-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Theme</p>
                <p className="font-semibold">{job.theme}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Image SHA256</p>
                <p className="font-mono text-xs break-all">{job.img_sha256}</p>
              </div>
            </CardContent>
          </Card>

          {/* Timing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timing Metrics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Download</span>
                <span className="font-mono text-sm">{formatDuration(job.download_ms)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Segmentation</span>
                <span className="font-mono text-sm">{formatDuration(job.segmentation_ms)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Backgrounds</span>
                <span className="font-mono text-sm">{formatDuration(job.backgrounds_ms)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Compositing</span>
                <span className="font-mono text-sm">{formatDuration(job.compositing_ms)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Derivatives</span>
                <span className="font-mono text-sm">{formatDuration(job.derivatives_ms)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Manifest</span>
                <span className="font-mono text-sm">{formatDuration(job.manifest_ms)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: S3 Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">S3 Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Original */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">Original</p>
                {job.s3_original_key && (
                  <button
                    onClick={() => handleCopyField('original', job.s3_original_key)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === 'original' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {job.s3_original_key || '—'}
              </p>
            </div>

            {/* Cutout */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">Cutout</p>
                {job.s3_cutout_key && (
                  <button
                    onClick={() => handleCopyField('cutout', job.s3_cutout_key)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === 'cutout' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {job.s3_cutout_key || '—'}
              </p>
            </div>

            {/* Mask */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs text-muted-foreground font-semibold uppercase">Mask</p>
                {job.s3_mask_key && (
                  <button
                    onClick={() => handleCopyField('mask', job.s3_mask_key)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === 'mask' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>
              <p className="font-mono text-xs break-all text-muted-foreground">
                {job.s3_mask_key || '—'}
              </p>
            </div>

            {/* Backgrounds */}
            {job.s3_bg_keys && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase mb-2">Backgrounds</p>
                <div className="space-y-1">
                  {JSON.parse(job.s3_bg_keys).map((key: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <button
                        onClick={() => handleCopyField(`bg-${i}`, key)}
                        className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                      >
                        {copied === `bg-${i}` ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <p className="font-mono text-xs break-all text-muted-foreground flex-1">
                        {key}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Composites */}
            {job.s3_composite_keys && (
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase mb-2">Composites</p>
                <div className="space-y-1">
                  {JSON.parse(job.s3_composite_keys).map((key: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <button
                        onClick={() => handleCopyField(`composite-${i}`, key)}
                        className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                      >
                        {copied === `composite-${i}` ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <p className="font-mono text-xs break-all text-muted-foreground flex-1">
                        {key}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Manifest */}
            {job.manifest_s3_key && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Manifest</p>
                  <button
                    onClick={() => handleCopyField('manifest', job.manifest_s3_key)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === 'manifest' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <p className="font-mono text-xs break-all text-muted-foreground">
                  {job.manifest_s3_key}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fail Dialog */}
      {showFailDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle>Fail Job</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Reason</label>
                <Input
                  placeholder="Why are you failing this job?"
                  value={failReason}
                  onChange={e => setFailReason(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowFailDialog(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleFail}
                  disabled={!failReason || failJobMutation.isPending}
                  className="flex-1"
                >
                  Fail Job
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

/**
 * Cutout & Mask Tab Component
 * Displays cutout and mask images with presigned URLs
 */
interface CutoutMaskTabProps {
  jobId: string;
  job: any;
}

const CutoutMaskTab: React.FC<CutoutMaskTabProps> = ({ jobId, job }) => {
  const { data: cutoutData, isLoading: cutoutLoading } = usePresignedUrl(jobId, 'cutout');
  const { data: maskData, isLoading: maskLoading } = usePresignedUrl(jobId, 'mask');

  if (!job) {
    return <p className="text-muted-foreground text-center py-8">Job data unavailable</p>;
  }

  if (cutoutLoading || maskLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading images...</div>;
  }

  if (!job.s3_cutout_key && !job.s3_mask_key) {
    return <p className="text-muted-foreground text-center py-8">Cutout assets not yet generated</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {job.s3_cutout_key && cutoutData?.url && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Cutout (Transparent)</p>
            <div className="bg-muted rounded-lg p-2 min-h-[200px] flex items-center justify-center overflow-hidden">
              <img
                src={cutoutData.url}
                alt="Cutout"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    const error = document.createElement('p');
                    error.className = 'text-xs text-muted-foreground';
                    error.textContent = 'Failed to load image';
                    parent.appendChild(error);
                  }
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 break-all">{job.s3_cutout_key}</p>
          </div>
        )}
        {job.s3_mask_key && maskData?.url && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Mask (Binary)</p>
            <div className="bg-muted rounded-lg p-2 min-h-[200px] flex items-center justify-center overflow-hidden">
              <img
                src={maskData.url}
                alt="Mask"
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    const error = document.createElement('p');
                    error.className = 'text-xs text-muted-foreground';
                    error.textContent = 'Failed to load image';
                    parent.appendChild(error);
                  }
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 break-all">{job.s3_mask_key}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobDetail;
