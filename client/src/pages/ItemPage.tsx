import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchItem, fetchPhotos, updateItem, uploadItemImage, type Item, type Photo } from "../lib/api";
import Header from "../components/Header";
import PhotoCaptureModal from "../components/PhotoCaptureModal";
import PhotoGallery from "../components/PhotoGallery";

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc'
  },
  topBar: {
    backgroundColor: '#2d3748',
    padding: '12px 32px',
    display: 'flex',
    gap: '16px'
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  headerSection: {
    backgroundColor: '#384050',
    color: 'white',
    padding: '24px 32px',
    marginBottom: '24px'
  },
  content: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 32px 32px'
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '32px',
    marginBottom: '24px'
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '24px',
    marginTop: '24px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  select: {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  textarea: {
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    resize: 'vertical' as const,
    minHeight: '80px',
    fontFamily: 'inherit'
  },
  leftColumn: {
    flex: '0 0 320px'
  },
  imageSection: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '24px',
    marginBottom: '24px'
  },
  imageBox: {
    width: '100%',
    aspectRatio: '1',
    backgroundColor: '#f1f5f9',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    border: '2px dashed #cbd5e1',
    overflow: 'hidden'
  },
  barcode: {
    width: '100%',
    height: '80px',
    backgroundColor: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    marginTop: '16px',
    fontFamily: 'monospace',
    fontSize: '24px',
    letterSpacing: '-2px'
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    fontSize: '14px',
    color: '#64748b'
  }
};

export default function ItemPage() {
  const { id } = useParams();
  const [item, setItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState<Partial<Item>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    fetchItem(id).then(data => {
      setItem(data);
      setFormData(data);
    }).catch(e => setErr(String(e)));
    fetchPhotos(id).then(setPhotos).catch(e => setErr(String(e)));
  }, [id]);

  const handleChange = (field: keyof Item, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCheckbox = (field: keyof Item, checked: boolean) => {
    setFormData(prev => ({ ...prev, [field]: checked ? 1 : 0 }));
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setErr("");
    setSuccess("");
    
    try {
      const updated = await updateItem(id, formData);
      setItem(updated);
      setFormData(updated);
      setSuccess("Item saved successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setErr(String(error));
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    
    setUploading(true);
    setErr("");
    setSuccess("");
    
    try {
      const updated = await uploadItemImage(id, file);
      setItem(updated);
      setFormData(updated);
      setSuccess("Image uploaded successfully!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setErr(String(error));
    } finally {
      setUploading(false);
    }
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoSaved = (photo: Photo) => {
    setPhotos(prev => [photo, ...prev]);
    setSuccess("Photo saved successfully!");
    setTimeout(() => setSuccess(""), 3000);
  };

  const handlePhotoDelete = async (photoId: string) => {
    if (!id) return;
    try {
      const r = await fetch(`/api/items/${id}/photos/${photoId}`, { method: "DELETE" });
      if (r.ok) {
        setPhotos(prev => prev.filter(p => p.id !== photoId));
        setSuccess("Photo deleted successfully!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setErr("Failed to delete photo");
      }
    } catch (error) {
      setErr(String(error));
    }
  };

  return (
    <div style={styles.container}>
      <Header />
      
      {/* Top Action Bar */}
      <div style={styles.topBar}>
        <button style={{...styles.button, backgroundColor: '#4a5568', color: 'white'}}>
          + Add Stock
        </button>
        <button style={{...styles.button, backgroundColor: '#2d3748', color: 'white', border: '1px solid #4a5568'}}>
          - Remove Stock
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
          <button style={{...styles.button, backgroundColor: '#6b7280', color: 'white'}}>
            📊 Ecom Verified
          </button>
          <button style={{...styles.button, backgroundColor: '#dc2626', color: 'white'}}>
            🧊 Freeze Item
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            style={{
              ...styles.button, 
              backgroundColor: saving ? '#86efac' : '#10b981', 
              color: 'white',
              opacity: saving ? 0.7 : 1,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? '⏳ Saving...' : '💾 Save details'}
          </button>
        </div>
      </div>

      {/* Header Section */}
      <div style={styles.headerSection}>
        <Link to="/" style={{ color: '#94a3b8', fontSize: '14px', textDecoration: 'none' }}>
          ← Back to Inventory
        </Link>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginTop: '12px', marginBottom: '4px' }}>
          ITEM DETAILS
        </h1>
      </div>

      {err && <div style={{ color: "#ef4444", padding: '16px 32px', backgroundColor: '#fef2f2', borderLeft: '4px solid #ef4444', margin: '0 32px 24px' }}>{err}</div>}
      {success && <div style={{ color: "#059669", padding: '16px 32px', backgroundColor: '#d1fae5', borderLeft: '4px solid #059669', margin: '0 32px 24px' }}>{success}</div>}

      <div style={styles.content}>
        <div style={{ display: 'flex', gap: '24px' }}>
          {/* Left Column - Image and Barcode */}
          <div style={styles.leftColumn}>
            <div style={styles.imageSection}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                    {item?.sku || 'VWS200433868'} 📋
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
                  Product
                </div>
                
                <div style={styles.imageBox}>
                  {formData.image_url ? (
                    <img src={formData.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                  ) : photos.length > 0 ? (
                    <img src={photos[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                      <div style={{ fontSize: '48px', marginBottom: '8px' }}>📷</div>
                      <div style={{ fontSize: '13px' }}>No Image</div>
                    </div>
                  )}
                </div>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleChooseFile}
                    disabled={uploading}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: uploading ? '#64748b' : '#1e293b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      opacity: uploading ? 0.7 : 1
                    }}
                  >
                    {uploading ? '⏳ Uploading...' : 'Choose file'}
                  </button>
                  <button 
                    onClick={() => setCamOpen(true)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    📷 Take Photo
                  </button>
                </div>

                {/* Photo Gallery */}
                {photos.length > 0 && (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                      Photo Gallery ({photos.length})
                    </div>
                    <PhotoGallery photos={photos} onDelete={handlePhotoDelete} />
                  </div>
                )}

                {/* Barcode */}
                <div style={styles.barcode}>
                  |||||||||||||||||||
                </div>

                {/* Checkboxes */}
                <div style={styles.checkbox}>
                  <input 
                    type="checkbox" 
                    id="extraScan" 
                    checked={!!formData.requires_extra_scan}
                    onChange={(e) => handleCheckbox('requires_extra_scan', e.target.checked)}
                  />
                  <label htmlFor="extraScan">Requires Extra Scan</label>
                </div>
                <div style={styles.checkbox}>
                  <input 
                    type="checkbox" 
                    id="ignoreSales" 
                    checked={!!formData.ignore_from_sales}
                    onChange={(e) => handleCheckbox('ignore_from_sales', e.target.checked)}
                  />
                  <label htmlFor="ignoreSales">Ignore From Sales Analytics</label>
                </div>
                <div style={styles.checkbox}>
                  <input 
                    type="checkbox" 
                    id="discontinued" 
                    checked={!!formData.discontinued}
                    onChange={(e) => handleCheckbox('discontinued', e.target.checked)}
                  />
                  <label htmlFor="discontinued">Discontinued</label>
                </div>

                {/* UPC */}
                <div style={{ marginTop: '24px' }}>
                  <label style={styles.label}>UPC</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input 
                      type="text" 
                      style={{...styles.input, flex: 1}} 
                      value={formData.upc || ''}
                      onChange={(e) => handleChange('upc', e.target.value)}
                    />
                    <button style={{
                      padding: '10px 16px',
                      backgroundColor: 'white',
                      color: '#ef4444',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Form Fields */}
          <div style={{ flex: 1 }}>
            <div style={styles.card}>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Brand</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.brand || ''} 
                    onChange={(e) => handleChange('brand', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Year</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.year || ''} 
                    onChange={(e) => handleChange('year', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Category</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.category || ''} 
                    onChange={(e) => handleChange('category', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Name *</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.name || ''} 
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Size</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.size || ''} 
                    onChange={(e) => handleChange('size', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Subcategory</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.subcategory || ''} 
                    onChange={(e) => handleChange('subcategory', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>ABV</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.abv || ''} 
                    onChange={(e) => handleChange('abv', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Weight</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.weight || ''} 
                    onChange={(e) => handleChange('weight', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Case size</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.case_size || ''} 
                    onChange={(e) => handleChange('case_size', e.target.value)}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>PAR level</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.par_level || ''} 
                    onChange={(e) => handleChange('par_level', e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <label style={styles.label}>Description</label>
                <textarea 
                  style={{...styles.textarea, marginTop: '8px'}} 
                  value={formData.description || ''} 
                  onChange={(e) => handleChange('description', e.target.value)}
                />
              </div>

              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Extra Field 1</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.extra_field_1 || ''} 
                    onChange={(e) => handleChange('extra_field_1', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Extra Field 2</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.extra_field_2 || ''} 
                    onChange={(e) => handleChange('extra_field_2', e.target.value)}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Extra Field 3</label>
                  <input 
                    type="text" 
                    style={styles.input} 
                    value={formData.extra_field_3 || ''} 
                    onChange={(e) => handleChange('extra_field_3', e.target.value)}
                  />
                </div>
              </div>

              {/* Warehouse Locations */}
              <div style={{ marginTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <label style={{...styles.label, margin: 0}}>Warehouse Locations</label>
                  <button style={{
                    padding: '6px 12px',
                    backgroundColor: '#1e293b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}>
                    ↻
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div style={styles.formGroup}>
                    <label style={{...styles.label, fontSize: '12px'}}>Shelf</label>
                    <input 
                      type="text" 
                      style={styles.input} 
                      value={formData.warehouse_shelf || ''} 
                      onChange={(e) => handleChange('warehouse_shelf', e.target.value)}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={{...styles.label, fontSize: '12px'}}>Row</label>
                    <input 
                      type="text" 
                      style={styles.input} 
                      value={formData.warehouse_row || ''} 
                      onChange={(e) => handleChange('warehouse_row', e.target.value)}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={{...styles.label, fontSize: '12px'}}>Column</label>
                    <input 
                      type="text" 
                      style={styles.input} 
                      value={formData.warehouse_column || ''} 
                      onChange={(e) => handleChange('warehouse_column', e.target.value)}
                    />
                  </div>
                  <button style={{
                    padding: '10px 16px',
                    color: '#10b981',
                    backgroundColor: 'white',
                    border: '1px solid #d1fae5',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}>
                    Delete
                  </button>
                </div>

                <button style={{
                  marginTop: '16px',
                  padding: '10px 16px',
                  backgroundColor: 'white',
                  color: '#3b82f6',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}>
                  + Add another Warehouse location
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      {id && (
        <PhotoCaptureModal
          open={camOpen}
          onClose={() => setCamOpen(false)}
          itemId={id}
          onSaved={handlePhotoSaved}
        />
      )}
    </div>
  );
}
