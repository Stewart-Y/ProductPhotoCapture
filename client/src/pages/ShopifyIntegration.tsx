/**
 * Shopify Integration Simulator Page
 *
 * Test pushing completed jobs to Shopify development store
 * Simulates the Shopify API integration before going live
 */

import { useState, useEffect } from 'react';

const API_BASE = '/api';

export default function ShopifyIntegration() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);

  const fetchCompletedJobs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/jobs?status=DONE&limit=50`);
      const data = await response.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePushToShopify = async (jobId: string) => {
    setPushing(jobId);
    try {
      const response = await fetch(`${API_BASE}/jobs/${jobId}/push-shopify`, {
        method: 'POST'
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Successfully pushed to Shopify!\n\nProduct: ${data.productId}\nMedia IDs: ${data.mediaIds?.join(', ')}`);
        fetchCompletedJobs(); // Refresh list
      } else {
        alert(`Failed to push to Shopify: ${data.error}`);
      }
    } catch (error) {
      console.error('Error pushing to Shopify:', error);
      alert('Error pushing to Shopify');
    } finally {
      setPushing(null);
    }
  };

  useEffect(() => {
    fetchCompletedJobs();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Shopify Integration</h1>
          <p className="text-muted-foreground mt-1">
            Test pushing completed jobs to your Shopify development store
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Configuration</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Make sure you've configured your Shopify credentials in the staging environment settings.
              This will push product images to your Shopify development store.
            </p>

            <button
              onClick={fetchCompletedJobs}
              disabled={loading}
              className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh Jobs'}
            </button>
          </div>

          {/* Completed Jobs List */}
          {jobs.length > 0 && (
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-bold mb-4">Completed Jobs ({jobs.length})</h3>
              <div className="space-y-3">
                {jobs.map(job => (
                  <div key={job.id} className="border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{job.sku}</p>
                        <p className="text-sm text-muted-foreground">Job: {job.id}</p>
                      </div>
                      <button
                        onClick={() => handlePushToShopify(job.id)}
                        disabled={pushing === job.id}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-50"
                      >
                        {pushing === job.id ? 'Pushing...' : 'Push to Shopify'}
                      </button>
                    </div>
                    {job.theme && <p className="text-sm text-muted-foreground">Theme: {job.theme}</p>}
                    {job.shopify_product_id && (
                      <p className="text-sm text-green-400">✓ Already pushed to Shopify (Product: {job.shopify_product_id})</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {jobs.length === 0 && !loading && (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
              <p className="text-muted-foreground">No completed jobs found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Complete some jobs first using the 3JMS Webhook Simulator
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
