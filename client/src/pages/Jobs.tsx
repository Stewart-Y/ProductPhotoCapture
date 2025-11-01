import React, { useState } from 'react';
import { useJobs, useRetryJob } from '../hooks';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui';
import { formatCurrency, formatRelativeTime } from '../lib/utils';
import { JobStatus } from '../lib/api-client';

const ALL_STATUSES: JobStatus[] = [
  'NEW',
  'BG_REMOVED',
  'BACKGROUND_READY',
  'COMPOSITED',
  'DERIVATIVES',
  'SHOPIFY_PUSH',
  'DONE',
  'FAILED',
];

export const Jobs: React.FC = () => {
  const [filters, setFilters] = useState({
    status: [] as JobStatus[],
    sku: '',
    theme: '',
  });
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);

  const { data: jobsData, isLoading } = useJobs({
    ...filters,
    status: filters.status.length > 0 ? filters.status : undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  const retryJob = useRetryJob();

  const handleStatusToggle = (status: JobStatus) => {
    setFilters(prev => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status],
    }));
    setPage(0);
  };

  const handleClearFilters = () => {
    setFilters({ status: [], sku: '', theme: '' });
    setPage(0);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Jobs</h1>
        <p className="text-muted-foreground mt-1">Manage and monitor all pipeline jobs</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">SKU</label>
              <Input
                placeholder="Search by SKU..."
                value={filters.sku}
                onChange={e => {
                  setFilters(prev => ({ ...prev, sku: e.target.value }));
                  setPage(0);
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Theme</label>
              <Input
                placeholder="Filter by theme..."
                value={filters.theme}
                onChange={e => {
                  setFilters(prev => ({ ...prev, theme: e.target.value }));
                  setPage(0);
                }}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={handleClearFilters} className="w-full">
                Clear Filters
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map(status => (
                <Button
                  key={status}
                  variant={filters.status.includes(status) ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleStatusToggle(status)}
                >
                  {status.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader className="flex flex-row justify-between items-center">
          <div>
            <CardTitle>
              Jobs
              {jobsData?.total ? ` (${jobsData.total} total)` : ''}
            </CardTitle>
          </div>
          {jobsData && (
            <div className="text-sm text-muted-foreground">
              Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, jobsData.total)} of {jobsData.total}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading jobs...</p>
          ) : jobsData?.jobs && jobsData.jobs.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Theme</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Cost</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground">
                          {formatRelativeTime(job.created_at)}
                        </TableCell>
                        <TableCell>{formatCurrency(job.cost_usd)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => (window.location.href = `/jobs/${job.id}`)}
                          >
                            View
                          </Button>
                          {job.status === 'FAILED' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => retryJob.mutate(job.id)}
                              disabled={retryJob.isPending}
                            >
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page + 1}
                </span>
                <Button
                  variant="outline"
                  disabled={!jobsData?.jobs || jobsData.jobs.length < pageSize}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-center py-8">No jobs found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Jobs;
