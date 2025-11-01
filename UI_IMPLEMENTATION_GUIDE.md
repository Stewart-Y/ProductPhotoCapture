# UI Implementation Guide
## 3JMS → AI Backgrounds → Shopify Dashboard

This document outlines the complete UI implementation for the product photo processing pipeline.

## ✅ Completed Infrastructure

### Dependencies Installed
```bash
@tanstack/react-query    # Data fetching and caching
@tanstack/react-table    # Table component
@tanstack/react-router   # Routing (alternative to react-router-dom)
tailwindcss             # Styling
class-variance-authority # Component variants
clsx                    # Class name utilities
tailwind-merge          # Merge Tailwind classes
lucide-react            # Icons
date-fns                # Date utilities
recharts                # Charts
```

### Files Created
- ✅ `tailwind.config.js` - Tailwind configuration with dark mode
- ✅ `postcss.config.js` - PostCSS configuration
- ✅ `src/index.css` - Global styles with Tailwind directives and status badge colors
- ✅ `src/lib/utils.ts` - Utility functions (cn, formatStatus, formatCurrency, formatDuration, formatRelativeTime)

## 📋 Implementation Checklist

### Phase 1: Core Infrastructure

#### 1.1 API Client (`src/lib/api-client.ts`)
```typescript
// Setup fetch wrapper with:
// - Base URL configuration
// - Error handling
// - TypeScript types for all endpoints
// - Request/response interceptors

export const apiClient = {
  jobs: {
    list: (filters) => fetch('/api/jobs'),
    get: (id) => fetch(`/api/jobs/${id}`),
    create: (data) => fetch('/api/jobs', { method: 'POST' }),
    retry: (id) => fetch(`/api/jobs/${id}/retry`, { method: 'POST' }),
    fail: (id, reason) => fetch(`/api/jobs/${id}/fail`, { method: 'POST' }),
  },
  stats: {
    dashboard: () => fetch('/api/jobs/stats'),
  },
  health: () => fetch('/health'),
  processor: {
    status: () => fetch('/api/processor/status'),
    start: () => fetch('/api/processor/start', { method: 'POST' }),
    stop: () => fetch('/api/processor/stop', { method: 'POST' }),
  },
};
```

#### 1.2 React Query Setup (`src/lib/query-client.ts`)
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchInterval: 10000, // Auto-refresh every 10s
    },
  },
});
```

#### 1.3 Type Definitions (`src/types/index.ts`)
```typescript
export type JobStatus =
  | 'NEW'
  | 'BG_REMOVED'
  | 'BACKGROUND_READY'
  | 'COMPOSITED'
  | 'DERIVATIVES'
  | 'SHOPIFY_PUSH'
  | 'DONE'
  | 'FAILED';

export interface Job {
  id: string;
  sku: string;
  theme: string;
  status: JobStatus;
  img_sha256: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cost_usd: number;
  // ... all other fields from database schema
}

export interface DashboardStats {
  today: {
    total: number;
    done: number;
    failed: number;
  };
  cost: {
    avgPerJob24h: number;
    totalMTD: number;
  };
  timing: {
    avgProcessingTime: number;
  };
}
```

### Phase 2: Layout Components

#### 2.1 AppShell (`src/components/layout/AppShell.tsx`)
```tsx
// Main layout with:
// - Top bar (title, search, theme toggle, alerts)
// - Left sidebar navigation
// - Main content area
// - Right drawer (contextual info)
```

#### 2.2 Sidebar (`src/components/layout/Sidebar.tsx`)
```tsx
// Navigation links:
// - Dashboard
// - Jobs
// - Providers
// - Health
// - Settings
```

#### 2.3 TopBar (`src/components/layout/TopBar.tsx`)
```tsx
// Contains:
// - App title/logo
// - Search input
// - Theme toggle (light/dark)
// - Notification bell
```

### Phase 3: Reusable Components

Create these in `src/components/ui/`:

#### 3.1 Button (`button.tsx`)
```tsx
// Variants: default, destructive, outline, ghost, link
// Sizes: sm, md, lg
```

#### 3.2 Card (`card.tsx`)
```tsx
// Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
```

#### 3.3 Badge (`badge.tsx`)
```tsx
// Status badges with color coding
```

#### 3.4 Table (`table.tsx`)
```tsx
// Table, TableHeader, TableBody, TableRow, TableCell
// With TanStack Table integration
```

#### 3.5 Input (`input.tsx`)
```tsx
// Text inputs with variants
```

#### 3.6 Select (`select.tsx`)
```tsx
// Dropdown select component
```

#### 3.7 Dialog (`dialog.tsx`)
```tsx
// Modal dialogs
```

#### 3.8 Spinner (`spinner.tsx`)
```tsx
// Loading spinner (already exists, may need styling update)
```

### Phase 4: Page Components

#### 4.1 Dashboard Page (`src/pages/Dashboard.tsx`)

**Hero Cards** (top row):
```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <StatCard title="Jobs Today" value={stats.today.total} />
  <StatCard title="Completed" value={stats.today.done} />
  <StatCard title="Failed" value={stats.today.failed} />
  <StatCard title="Avg Cost/Job" value={formatCurrency(stats.cost.avgPerJob24h)} />
</div>
```

**Charts**:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
  <Card>
    <CardHeader><CardTitle>Jobs per Hour</CardTitle></CardHeader>
    <CardContent>
      <AreaChart data={hourlyData} />
    </CardContent>
  </Card>

  <Card>
    <CardHeader><CardTitle>Cost by Theme</CardTitle></CardHeader>
    <CardContent>
      <BarChart data={costByTheme} />
    </CardContent>
  </Card>
</div>
```

**Recent Failures Table**:
```tsx
<Card className="mt-4">
  <CardHeader>
    <CardTitle>Recent Failures</CardTitle>
  </CardHeader>
  <CardContent>
    <Table>
      {/* ErrorCode, SKU, Theme, Time, Actions */}
    </Table>
  </CardContent>
</Card>
```

#### 4.2 Jobs List Page (`src/pages/Jobs.tsx`)

**Filters** (sticky top bar):
```tsx
<div className="flex gap-2 p-4 bg-card border-b sticky top-0">
  <Select placeholder="Status">
    <option value="NEW">New</option>
    <option value="BG_REMOVED">BG Removed</option>
    {/* ... all statuses */}
  </Select>

  <Input placeholder="Search SKU or Job ID" />

  <Select placeholder="Theme">
    <option value="default">Default</option>
  </Select>

  <Button variant="outline">Clear Filters</Button>
</div>
```

**Table** (using TanStack Table):
```tsx
const columns = [
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => (
    <Badge className={`status-${formatStatus(row.original.status)}`}>
      {row.original.status}
    </Badge>
  )},
  { accessorKey: 'sku', header: 'SKU' },
  { accessorKey: 'theme', header: 'Theme' },
  { accessorKey: 'created_at', header: 'Created', cell: ({ row }) => (
    formatRelativeTime(row.original.created_at)
  )},
  { accessorKey: 'cost_usd', header: 'Cost', cell: ({ row }) => (
    formatCurrency(row.original.cost_usd)
  )},
  {
    id: 'actions',
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate(`/jobs/${row.original.id}`)}>
          View
        </Button>
        <Button size="sm" variant="ghost" onClick={() => retryJob(row.original.id)}>
          Retry
        </Button>
      </div>
    ),
  },
];

<DataTable columns={columns} data={jobs} />
```

**Pagination**:
```tsx
<div className="flex justify-between items-center p-4">
  <div>Showing {start}-{end} of {total}</div>
  <div className="flex gap-2">
    <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
      Previous
    </Button>
    <Button disabled={!hasMore} onClick={() => setPage(p => p + 1)}>
      Next
    </Button>
  </div>
</div>
```

#### 4.3 Job Detail Page (`src/pages/JobDetail.tsx`)

**Header** (status stepper):
```tsx
<div className="bg-card border-b p-6">
  <div className="flex justify-between items-start">
    <div>
      <h1 className="text-2xl font-bold">{job.sku}</h1>
      <p className="text-muted-foreground">Job ID: {job.id}</p>
    </div>
    <div className="flex gap-2">
      <Button onClick={() => retryJob(job.id)}>Retry</Button>
      <Button variant="destructive" onClick={() => failJob(job.id)}>Fail</Button>
    </div>
  </div>

  <StepperComponent currentStep={getStepFromStatus(job.status)} />
</div>
```

**Three-column layout**:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-6">
  {/* Left: Timeline */}
  <Card>
    <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
    <CardContent>
      <Timeline events={[
        { status: 'NEW', timestamp: job.created_at },
        { status: 'BG_REMOVED', timestamp: job.updated_at },
        // ...
      ]} />
    </CardContent>
  </Card>

  {/* Center: Preview Gallery */}
  <Card className="lg:col-span-2">
    <CardHeader><CardTitle>Images</CardTitle></CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-4">
        {job.s3_cutout_key && (
          <div>
            <p className="font-medium mb-2">Cutout</p>
            <img src={getCutoutUrl(job)} alt="Cutout" />
          </div>
        )}
        {/* Mask, Backgrounds, Composites, Derivatives */}
      </div>
    </CardContent>
  </Card>
</div>
```

**Bottom: Metadata tabs**:
```tsx
<Tabs defaultValue="s3keys">
  <TabsList>
    <TabsTrigger value="s3keys">S3 Keys</TabsTrigger>
    <TabsTrigger value="timing">Timing</TabsTrigger>
    <TabsTrigger value="costs">Costs</TabsTrigger>
    <TabsTrigger value="errors">Errors</TabsTrigger>
  </TabsList>

  <TabsContent value="s3keys">
    <div className="space-y-2">
      <CopyableField label="Cutout" value={job.s3_cutout_key} />
      <CopyableField label="Mask" value={job.s3_mask_key} />
      {/* ... */}
    </div>
  </TabsContent>

  {/* Other tabs */}
</Tabs>
```

#### 4.4 Providers Page (`src/pages/Providers.tsx`)

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <ProviderCard
    name="Freepik"
    status="connected"
    capabilities={['segmentation', 'background-generation']}
    cost={{ segmentation: 0.02, backgroundGen: 0.02 }}
  />

  {/* Add more providers as they're integrated */}
</div>
```

#### 4.5 Settings Page (`src/pages/Settings.tsx`)

```tsx
<div className="space-y-6">
  <Card>
    <CardHeader><CardTitle>API Keys</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <InputField
        label="Freepik API Key"
        type="password"
        value={settings.freepikApiKey}
        onChange={(v) => updateSetting('freepikApiKey', v)}
      />

      <InputField
        label="Shopify Access Token"
        type="password"
        value={settings.shopifyToken}
        onChange={(v) => updateSetting('shopifyToken', v)}
      />
    </CardContent>
  </Card>

  <Card>
    <CardHeader><CardTitle>S3 Configuration</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <InputField label="Bucket" value={settings.s3Bucket} readOnly />
      <InputField label="Region" value={settings.s3Region} readOnly />
    </CardContent>
  </Card>
</div>
```

#### 4.6 Health Page (`src/pages/Health.tsx`)

```tsx
<div className="space-y-4">
  <Card>
    <CardHeader><CardTitle>System Health</CardTitle></CardHeader>
    <CardContent>
      <div className="space-y-2">
        <HealthCheckRow service="API Server" status="healthy" />
        <HealthCheckRow service="Database" status="healthy" />
        <HealthCheckRow service="S3" status="healthy" />
        <HealthCheckRow service="Freepik API" status="healthy" />
        <HealthCheckRow service="Processor" status={processorStatus.isRunning ? 'running' : 'stopped'} />
      </div>
    </CardContent>
  </Card>

  <Card>
    <CardHeader><CardTitle>Background Worker</CardTitle></CardHeader>
    <CardContent>
      <div className="space-y-2">
        <div>Status: {processorStatus.isRunning ? 'Running' : 'Stopped'}</div>
        <div>Poll Interval: {processorStatus.config?.pollInterval}ms</div>
        <div>Concurrency: {processorStatus.config?.concurrency}</div>
        <div>Current Jobs: {processorStatus.currentJobs?.length || 0}</div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button onClick={startProcessor} disabled={processorStatus.isRunning}>
          Start Processor
        </Button>
        <Button variant="destructive" onClick={stopProcessor} disabled={!processorStatus.isRunning}>
          Stop Processor
        </Button>
      </div>
    </CardContent>
  </Card>
</div>
```

### Phase 5: React Query Hooks

Create in `src/hooks/`:

#### 5.1 `useJobs.ts`
```typescript
export function useJobs(filters?: JobFilters) {
  return useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => apiClient.jobs.list(filters),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ['job', id],
    queryFn: () => apiClient.jobs.get(id),
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.jobs.retry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}
```

#### 5.2 `useDashboardStats.ts`
```typescript
export function useDashboardStats() {
  return useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => apiClient.stats.dashboard(),
    refetchInterval: 10000, // Refresh every 10s
  });
}
```

#### 5.3 `useProcessorStatus.ts`
```typescript
export function useProcessorStatus() {
  return useQuery({
    queryKey: ['processor', 'status'],
    queryFn: () => apiClient.processor.status(),
    refetchInterval: 5000, // Refresh every 5s
  });
}
```

### Phase 6: Routing Setup

#### Update `src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

#### Update `src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Providers from './pages/Providers';
import Health from './pages/Health';
import Settings from './pages/Settings';

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/health" element={<Health />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}

export default App;
```

## 🎨 Design System Reference

### Colors
- **Primary**: Blue (#3B82F6)
- **Success**: Green (#10B981)
- **Warning**: Yellow (#F59E0B)
- **Error**: Red (#EF4444)
- **Muted**: Gray (#6B7280)

### Typography
- **Font**: Inter (fallback to system fonts)
- **Sizes**: 12px, 14px (base), 16px, 20px, 24px, 32px

### Spacing
- **Unit**: 4px base
- **Scale**: 0, 1 (4px), 2 (8px), 3 (12px), 4 (16px), 6 (24px), 8 (32px), 12 (48px)

### Border Radius
- **Default**: 8px
- **Large**: 16px
- **Small**: 4px

### Shadows
- **SM**: 0 1px 2px 0 rgb(0 0 0 / 0.05)
- **MD**: 0 4px 6px -1px rgb(0 0 0 / 0.1)
- **LG**: 0 10px 15px -3px rgb(0 0 0 / 0.1)

## 🚀 Development Workflow

1. **Start development server**:
   ```bash
   cd client
   npm run dev
   ```

2. **Build for production**:
   ```bash
   npm run build
   ```

3. **Preview production build**:
   ```bash
   npm run preview
   ```

## 📝 Next Steps

1. Implement API client with all endpoints
2. Create reusable UI components (Button, Card, Badge, Table, etc.)
3. Build Dashboard page with stats and charts
4. Build Jobs list page with filters and table
5. Build Job detail page with timeline and image preview
6. Add Providers, Health, and Settings pages
7. Implement dark mode toggle
8. Add error boundaries and loading states
9. Add toast notifications for user actions
10. Implement real-time updates with polling/WebSocket

## 🔧 API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List all jobs with optional filters |
| GET | `/api/jobs/:id` | Get single job details |
| POST | `/api/jobs/:id/retry` | Retry failed job |
| POST | `/api/jobs/:id/fail` | Manually fail a job |
| GET | `/api/jobs/stats` | Get dashboard statistics |
| GET | `/health` | System health check |
| GET | `/api/processor/status` | Get processor status |
| POST | `/api/processor/start` | Start background processor |
| POST | `/api/processor/stop` | Stop background processor |

## 📊 Status Flow Visualization

```
NEW
  ↓
BG_REMOVED (cutout + mask ready)
  ↓
BACKGROUND_READY (AI backgrounds generated)
  ↓
COMPOSITED (drop shadow + centering applied)
  ↓
DERIVATIVES (9 files per composite generated)
  ↓
SHOPIFY_PUSH (uploading to Shopify)
  ↓
DONE

       ↓ (any step can fail)
     FAILED
```

## 🎯 MVP Scope (Week 1)

Focus on implementing these pages first:
1. ✅ Dashboard (executive overview)
2. ✅ Jobs list (with basic filters)
3. ✅ Job detail (with timeline and status)
4. ✅ Health page (processor status)

Defer for later:
- Providers configuration
- Settings management
- Advanced filters
- Charts and analytics
- Real-time WebSocket updates

This gives you a functional admin interface to monitor and manage the Flow v2 pipeline!
