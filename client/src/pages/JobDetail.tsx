import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useJob, useRetryJob, useFailJob } from '../hooks';
import { Button, Card, CardContent, CardHeader, CardTitle, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Input } from '../components/ui';
import { formatCurrency, formatDuration, formatRelativeTime } from '../lib/utils';
import { AlertCircle, Copy, Check } from 'lucide-react';

const STEPS = ['NEW', 'BG_REMOVED', 'BACKGROUND_READY', 'COMPOSITED', 'DERIVATIVES', 'SHOPIFY_PUSH', 'DONE'];

export const JobDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [copied, setCopied] = useState<string | null>(null);
  const [failReason, setFailReason] = useState('');
  const [showFailDialog, setShowFailDialog] = useState(false);

  const { data: jobData, isLoading } = useJob(id);
  const retryJob = useRetryJob();
  const failJobMutation = useFailJob();

  const job = jobData?.job;
  const currentStepIndex = job ? STEPS.indexOf(job.status as any) : -1;

  const handleCopyField = (field: string, value: string | null) => {
    if (value) {
      navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleFail = () => {
    if (job && failReason) {
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

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">{job.sku}</h1>
          <p className="text-muted-foreground mt-1">
            Job ID: <span className="font-mono">{job.id}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {job.status === 'FAILED' && (
            <Button
              variant="outline"
              onClick={() => retryJob.mutate(job.id)}
              disabled={retryJob.isPending}
            >
              Retry
            </Button>
          )}
          {job.status !== 'DONE' && job.status !== 'FAILED' && (
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

export default JobDetail;
