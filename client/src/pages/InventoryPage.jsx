import { useEffect, useState } from "react";
import { fetchItems, syncFrom3JMS } from "../lib/api";
import { Link } from "react-router-dom";
import Header from "../components/Header";

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '32px 24px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden'
  },
  toolbar: {
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    backgroundColor: '#fafbfc'
  },
  searchInput: {
    flex: 1,
    padding: '10px 16px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    backgroundColor: 'white'
  },
  addButton: {
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: '600',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  th: {
    padding: '16px 20px',
    textAlign: 'left',
    fontWeight: '700',
    color: '#475569',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    backgroundColor: '#f8fafc',
    borderBottom: '2px solid #e2e8f0'
  },
  td: {
    padding: '16px 20px',
    borderBottom: '1px solid #f1f5f9'
  },
  imageBox: {
    width: '56px',
    height: '56px',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '9px',
    color: '#94a3b8',
    fontWeight: '500',
    border: '1px solid #e2e8f0',
    overflow: 'hidden'
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '13px'
  },
  itemName: {
    color: '#1e293b',
    fontWeight: '500',
    fontSize: '14px'
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: '13px'
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
    padding: '24px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#fafbfc'
  },
  pageButton: {
    padding: '8px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    backgroundColor: 'white',
    color: '#475569',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontWeight: '500',
    minWidth: '40px'
  },
  pageButtonActive: {
    backgroundColor: '#3b82f6',
    color: 'white',
    borderColor: '#3b82f6',
    fontWeight: '600'
  },
  pageButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
};

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchItems().then(setItems).catch(e => setErr(String(e)));
  }, []);

  // Calculate pagination
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = items.slice(startIndex, endIndex);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 7; // Show max 7 page buttons
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('...');
      }
      
      // Show pages around current page
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult("");
    setErr("");
    try {
      const result = await syncFrom3JMS();
      setSyncResult(`Sync complete: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`);
      // Refresh items list after sync
      const refreshedItems = await fetchItems();
      setItems(refreshedItems);
      setCurrentPage(1); // Reset to first page after sync
    } catch (e) {
      setErr(`Sync failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div style={styles.container}>
      <Header />
      <div style={styles.content}>
        <div style={styles.card}>
          <div style={styles.toolbar}>
            <input 
              type="search" 
              placeholder="Search..." 
              style={styles.searchInput}
              onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
              onBlur={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
            />
            <button 
              style={{...styles.addButton, backgroundColor: syncing ? '#94a3b8' : '#10b981'}}
              onMouseEnter={(e) => !syncing && (e.currentTarget.style.backgroundColor = '#059669')}
              onMouseLeave={(e) => !syncing && (e.currentTarget.style.backgroundColor = '#10b981')}
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? '⏳ Syncing...' : '🔄 Sync from 3JMS'}
            </button>
            <button 
              style={styles.addButton}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
            >
              + Add Item
            </button>
          </div>

          {err && <div style={{ color: "#ef4444", padding: '20px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444' }}>{err}</div>}
          {syncResult && <div style={{ color: "#10b981", padding: '20px', backgroundColor: '#f0fdf4', borderLeft: '4px solid #10b981' }}>{syncResult}</div>}

          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{...styles.th, width: '50px'}}>
                    <input type="checkbox" style={{ cursor: 'pointer' }} />
                  </th>
                  <th style={{...styles.th, width: '100px'}}>Image</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Display Name</th>
                  <th style={styles.th}>Location</th>
                  <th style={styles.th}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map(it => (
                  <tr 
                    key={it.id}
                    style={{ 
                      backgroundColor: 'white',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    <td style={styles.td}>
                      <input type="checkbox" style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={styles.td}>
                      <div style={styles.imageBox}>
                        {it.image_url ? (
                          <img 
                            src={it.image_url} 
                            alt="" 
                            style={{ 
                              width: '100%', 
                              height: '100%', 
                              objectFit: 'contain', 
                              borderRadius: '8px' 
                            }} 
                          />
                        ) : (
                          'No Image'
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <Link to={`/items/${it.id}`} style={styles.link}>
                        {it.sku || '-'}
                      </Link>
                    </td>
                    <td style={styles.td}>
                      <div>
                        <span style={styles.itemName}>{it.name}</span>
                        {it.brand && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {it.brand}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.emptyText}>
                        {it.warehouse_shelf ? (
                          <span style={{ color: '#475569' }}>
                            {it.warehouse_shelf}
                            {it.warehouse_row && ` / Row ${it.warehouse_row}`}
                            {it.warehouse_column && ` / ${it.warehouse_column}`}
                          </span>
                        ) : '-'}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <span style={styles.emptyText}>-</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {items.length === 0 && !err && (
            <div style={{ 
              padding: '60px 20px', 
              textAlign: 'center', 
              color: '#94a3b8',
              fontSize: '14px'
            }}>
              No items found
            </div>
          )}

          {/* Pagination */}
          {items.length > 0 && totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                style={{
                  ...styles.pageButton,
                  ...(currentPage === 1 ? styles.pageButtonDisabled : {})
                }}
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                onMouseEnter={(e) => currentPage !== 1 && (e.currentTarget.style.borderColor = '#3b82f6')}
                onMouseLeave={(e) => currentPage !== 1 && (e.currentTarget.style.borderColor = '#cbd5e1')}
              >
                ← Prev
              </button>

              {getPageNumbers().map((page, idx) => (
                typeof page === 'number' ? (
                  <button
                    key={idx}
                    style={{
                      ...styles.pageButton,
                      ...(currentPage === page ? styles.pageButtonActive : {})
                    }}
                    onClick={() => setCurrentPage(page)}
                    onMouseEnter={(e) => {
                      if (currentPage !== page) {
                        e.currentTarget.style.borderColor = '#3b82f6';
                        e.currentTarget.style.color = '#3b82f6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== page) {
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    {page}
                  </button>
                ) : (
                  <span key={idx} style={{ padding: '8px 4px', color: '#94a3b8' }}>
                    {page}
                  </span>
                )
              ))}

              <button
                style={{
                  ...styles.pageButton,
                  ...(currentPage === totalPages ? styles.pageButtonDisabled : {})
                }}
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                onMouseEnter={(e) => currentPage !== totalPages && (e.currentTarget.style.borderColor = '#3b82f6')}
                onMouseLeave={(e) => currentPage !== totalPages && (e.currentTarget.style.borderColor = '#cbd5e1')}
              >
                Next →
              </button>

              <span style={{ marginLeft: '16px', fontSize: '13px', color: '#64748b' }}>
                Showing {startIndex + 1}-{Math.min(endIndex, items.length)} of {items.length} items
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


