import React, { useState } from 'react';
import { useDashboardStats, useJobs, useProcessorStatus } from '../hooks';
import { StatCard } from '../components/StatCard';
import { Card, CardContent, CardHeader, CardTitle, Button, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';
import { formatCurrency, formatDuration, formatRelativeTime } from '../lib/utils';
import { Activity, TrendingUp, AlertCircle, Zap, Upload } from 'lucide-react';
import TestUploadModal from '../components/TestUploadModal';

export const Dashboard: React.FC = () => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: jobsData, isLoading: jobsLoading } = useJobs({ limit: 10, status: 'FAILED' });
  const { data: processorStatus, isLoading: processorLoading } = useProcessorStatus();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Executive overview of your pipeline</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={() => setUploadModalOpen(true)}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            Test Upload
          </Button>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Processor Status</p>
            <p className="text-lg font-semibold">
              {processorLoading ? '...' : processorStatus?.isRunning ? '🟢 Running' : '🔴 Stopped'}
            </p>
          </div>
        </div>
      </div>

      {/* Hero Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Jobs Today"
          value={statsLoading ? '-' : stats?.today.total || 0}
          subtitle={`${stats?.today.done || 0} completed`}
          icon={<Activity className="w-8 h-8" />}
        />
        <StatCard
          title="Completed"
          value={statsLoading ? '-' : stats?.today.done || 0}
          subtitle={`${stats?.today.failed || 0} failed`}
          icon={<TrendingUp className="w-8 h-8" />}
        />
        <StatCard
          title="Avg Cost/Job (24h)"
          value={statsLoading ? '-' : formatCurrency(stats?.cost.avgPerJob24h || 0)}
          subtitle="Freepik API"
          icon={<Zap className="w-8 h-8" />}
        />
        <StatCard
          title="Avg Processing Time"
          value={statsLoading ? '-' : formatDuration(stats?.timing.avgProcessingTime || 0)}
          subtitle="Full pipeline"
          icon={<AlertCircle className="w-8 h-8" />}
        />
      </div>

      {/* Recent Failures Table */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <CardTitle>Recent Failures</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/jobs?status=FAILED'}>
            View All →
          </Button>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : jobsData?.jobs && jobsData.jobs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Theme</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobsData.jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{job.sku}</TableCell>
                      <TableCell>{job.theme}</TableCell>
                      <TableCell className="text-sm text-red-600">
                        {job.error_code}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatRelativeTime(job.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => (window.location.href = `/jobs/${job.id}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No failures today 🎉</p>
          )}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Poll Interval</p>
              <p className="font-semibold">{processorStatus?.config?.pollInterval || '-'}ms</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Concurrency</p>
              <p className="font-semibold">{processorStatus?.config?.concurrency || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Jobs</p>
              <p className="font-semibold">{processorStatus?.currentJobs?.length || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="font-semibold">{processorStatus?.version || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Upload Modal */}
      <TestUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={(jobId) => {
          // Redirect to job detail page
          window.location.href = `/jobs/${jobId}`;
        }}
      />
    </div>
  );
};

export default Dashboard;
