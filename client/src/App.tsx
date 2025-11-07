import { Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Settings from './pages/Settings';
import BackgroundTemplates from './pages/BackgroundTemplates';
import WebhookSimulator from './pages/WebhookSimulator';
import ShopifyIntegration from './pages/ShopifyIntegration';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';

function App() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <TopBar />

        {/* Page Content */}
        <div className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/templates" element={<BackgroundTemplates />} />
            <Route path="/webhook" element={<WebhookSimulator />} />
            <Route path="/shopify" element={<ShopifyIntegration />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default App;
