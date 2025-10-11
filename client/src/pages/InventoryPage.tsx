import { useEffect, useState } from "react";
import { fetchItems, type Item } from "../lib/api";
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
    whiteSpace: 'nowrap' as const
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px'
  },
  th: {
    padding: '16px 20px',
    textAlign: 'left' as const,
    fontWeight: '700' as const,
    color: '#475569',
    fontSize: '11px',
    textTransform: 'uppercase' as const,
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
    fontWeight: '500' as const,
    border: '1px solid #e2e8f0',
    overflow: 'hidden'
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: '600' as const,
    fontSize: '13px'
  },
  itemName: {
    color: '#1e293b',
    fontWeight: '500' as const,
    fontSize: '14px'
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: '13px'
  }
};

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchItems().then(setItems).catch(e => setErr(String(e)));
  }, []);

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
              style={styles.addButton}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
            >
              + Add Item
            </button>
          </div>

          {err && <div style={{ color: "#ef4444", padding: '20px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444' }}>{err}</div>}

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
                {items.map(it => (
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
        </div>
      </div>
    </div>
  );
}
