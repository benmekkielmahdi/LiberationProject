import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  AlertTriangle, 
  FileText, 
  Download, 
  Upload, 
  RefreshCw, 
  Share2, 
  Moon, 
  Sun, 
  Trash2, 
  Check, 
  X,
  FileSpreadsheet,
  GraduationCap,
  Database,
  Wifi,
  WifiOff,
  Copy
} from 'lucide-react';

const dorms = ['A', 'B', 'C', 'D'];
const floors = [
  { id: 0, label: 'Rez-de-chaussée', short: 'RDC' },
  { id: 1, label: '1er Étage', short: '1er' },
  { id: 2, label: '2ème Étage', short: '2ème' },
  { id: 3, label: '3ème Étage', short: '3ème' }
];

const base64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Helper: Encode 336 room validation bits into a Base64 string (56 chars)
function encodeState(rooms) {
  const sorted = [...rooms].sort((a, b) => {
    if (a.dorm !== b.dorm) return a.dorm.localeCompare(b.dorm);
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.number - b.number;
  });
  let bitString = "";
  for (const r of sorted) {
    bitString += r.validated ? "1" : "0";
  }
  
  let encoded = "";
  for (let i = 0; i < bitString.length; i += 6) {
    const chunk = bitString.substring(i, i + 6);
    const value = parseInt(chunk.padEnd(6, '0'), 2);
    encoded += base64chars[value];
  }
  return encoded;
}

// Helper: Decode Base64 validation string back into rooms state
function decodeState(encodedString, currentRooms) {
  if (!encodedString) return currentRooms;
  let bitString = "";
  for (const char of encodedString) {
    const value = base64chars.indexOf(char);
    if (value === -1) continue;
    bitString += value.toString(2).padStart(6, '0');
  }
  
  const sorted = [...currentRooms].sort((a, b) => {
    if (a.dorm !== b.dorm) return a.dorm.localeCompare(b.dorm);
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.number - b.number;
  });
  
  const idToValidated = {};
  for (let i = 0; i < sorted.length; i++) {
    if (i < bitString.length) {
      idToValidated[sorted[i].id] = bitString[i] === "1";
    } else {
      idToValidated[sorted[i].id] = false;
    }
  }
  
  return currentRooms.map(room => ({
    ...room,
    validated: !!idToValidated[room.id]
  }));
}

function App() {
  // 1. Initial State Generation (Chambres numérotées de 1 à 84 de manière continue dans chaque dortoir)
  const generateInitialRooms = () => {
    const initial = [];
    for (const dorm of dorms) {
      for (const floor of floors) {
        for (let r = 1; r <= 21; r++) {
          const roomNumber = floor.id * 21 + r;
          initial.push({
            id: `${dorm}-${floor.id}-${roomNumber}`,
            dorm,
            floor: floor.id,
            number: roomNumber,
            validated: false
          });
        }
      }
    }
    return initial;
  };

  // 2. React States
  const [rooms, setRooms] = useState(() => {
    // Check URL query parameters first
    const queryParams = new URLSearchParams(window.location.search);
    const stateParam = queryParams.get('s');
    const initial = generateInitialRooms();
    
    if (stateParam) {
      try {
        return decodeState(stateParam, initial);
      } catch (e) {
        console.error("Failed to decode URL state:", e);
      }
    }
    
    // Check local storage if no URL query param is present
    const saved = localStorage.getItem('ibn_timya_rooms_v3');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse local storage:", e);
      }
    }
    
    return initial;
  });

  const [activeDorm, setActiveDorm] = useState('A');
  const [activeFloor, setActiveFloor] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  // Supabase Configuration States
  // Defaults to environment variables (Vercel deployment) then falls back to localStorage (manual config)
  const ENV_URL = import.meta.env.VITE_SUPABASE_URL || '';
  const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem('ibn_timya_supabase_url') || ENV_URL);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(() => localStorage.getItem('ibn_timya_supabase_key') || ENV_KEY);
  // Auto-activate if env variables are present
  const [isSyncActive, setIsSyncActive] = useState(() => {
    if (ENV_URL && ENV_KEY) return true;
    return localStorage.getItem('ibn_timya_supabase_active') === 'true';
  });
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Initialize Supabase Client if Sync is Active
  const supabase = React.useMemo(() => {
    if (isSyncActive && supabaseUrl && supabaseAnonKey) {
      try {
        let sanitizedUrl = supabaseUrl.trim();
        // Remove trailing slash if present
        if (sanitizedUrl.endsWith('/')) {
          sanitizedUrl = sanitizedUrl.slice(0, -1);
        }
        // Remove /rest/v1 if present
        if (sanitizedUrl.endsWith('/rest/v1')) {
          sanitizedUrl = sanitizedUrl.slice(0, -8);
        }
        // Remove trailing slash again just in case
        if (sanitizedUrl.endsWith('/')) {
          sanitizedUrl = sanitizedUrl.slice(0, -1);
        }
        return createClient(sanitizedUrl, supabaseAnonKey.trim());
      } catch (err) {
        console.error("Error creating Supabase client:", err);
        return null;
      }
    }
    return null;
  }, [isSyncActive, supabaseUrl, supabaseAnonKey]);

  // Supabase Live Synchronization Effect
  useEffect(() => {
    if (!supabase) return;
    
    const fetchRoomsFromSupabase = async () => {
      const { data, error } = await supabase
        .from('ibn_timya_rooms')
        .select('*')
        .order('id');
        
      if (error) {
        console.error("Error fetching rooms:", error);
        showToast("Erreur de récupération Supabase. Vérifiez votre SQL ou votre clé.");
        return;
      }
      
      if (data && data.length > 0) {
        setRooms(data);
        showToast("Données synchronisées en temps réel.");
      } else {
        // Table is empty, offer to auto-seed
        showToast("Base Supabase vide. Initialisation en cours...");
        const initial = generateInitialRooms();
        const { error: insertErr } = await supabase.from('ibn_timya_rooms').insert(initial);
        if (insertErr) {
          console.error("Error seeding rooms:", insertErr);
          showToast("Erreur d'initialisation de la table.");
        } else {
          setRooms(initial);
          showToast("Base de données initialisée avec succès !");
        }
      }
    };
    
    fetchRoomsFromSupabase();
    
    // Subscribe to database changes
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ibn_timya_rooms'
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setRooms(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
          } else if (payload.eventType === 'INSERT') {
            setRooms(prev => {
              if (prev.some(r => r.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // 3. Keep LocalStorage and URL Address Bar Sync'd with State
  const updateRoomsAndUrl = (newRooms) => {
    setRooms(newRooms);
    localStorage.setItem('ibn_timya_rooms_v3', JSON.stringify(newRooms));
    
    // Encode state and push to URL
    const encoded = encodeState(newRooms);
    const queryParams = new URLSearchParams(window.location.search);
    queryParams.set('s', encoded);
    
    const newurl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?${queryParams.toString()}`;
    window.history.replaceState({ path: newurl }, '', newurl);
  };

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);

  // Show Toast Messages
  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 4. Action Handlers
  const handleToggleValidation = (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    const nextState = !room.validated;
    const confirmMsg = nextState 
      ? `Voulez-vous marquer la Chambre ${room.dorm} - ${room.number} comme "VÉRIFIÉE" ?`
      : `Voulez-vous marquer la Chambre ${room.dorm} - ${room.number} comme "NON VÉRIFIÉE" ?`;
      
    setConfirmDialog({
      message: confirmMsg,
      onConfirm: async () => {
        // Optimistic local update
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, validated: nextState } : r));
        
        if (supabase) {
          const { error } = await supabase
            .from('ibn_timya_rooms')
            .update({ validated: nextState })
            .eq('id', roomId);
            
          if (error) {
            console.error("Error updating room:", error);
            showToast("Erreur de synchronisation avec le serveur. Mis à jour localement uniquement.");
          } else {
            showToast(`Chambre ${room.dorm} - ${room.number} synchronisée en temps réel.`);
          }
        } else {
          // Offline mode
          const newRooms = rooms.map(r => r.id === roomId ? { ...r, validated: nextState } : r);
          updateRoomsAndUrl(newRooms);
          showToast(`Chambre ${room.dorm} - ${room.number} est maintenant ${nextState ? 'Vérifiée' : 'Non vérifiée'}.`);
        }
      }
    });
  };

  const handleBatchValidateFloor = () => {
    const floorRoomIds = rooms
      .filter(room => room.dorm === activeDorm && room.floor === activeFloor)
      .map(r => r.id);
      
    setConfirmDialog({
      message: `Voulez-vous marquer TOUTES les chambres du dortoir ${activeDorm} - ${floors.find(f => f.id === activeFloor).label} comme VÉRIFIÉES ?`,
      onConfirm: async () => {
        setRooms(prev => prev.map(room => 
          room.dorm === activeDorm && room.floor === activeFloor ? { ...room, validated: true } : room
        ));
        
        if (supabase) {
          const { error } = await supabase
            .from('ibn_timya_rooms')
            .update({ validated: true })
            .in('id', floorRoomIds);
            
          if (error) {
            console.error("Error batch updating:", error);
            showToast("Erreur de synchronisation par lot. Mis à jour localement uniquement.");
          } else {
            showToast(`Étage ${activeDorm} - ${floors.find(f => f.id === activeFloor).short} vérifié en temps réel.`);
          }
        } else {
          const newRooms = rooms.map(room => 
            room.dorm === activeDorm && room.floor === activeFloor ? { ...room, validated: true } : room
          );
          updateRoomsAndUrl(newRooms);
          showToast(`Toutes les chambres de ${activeDorm} - ${floors.find(f => f.id === activeFloor).short} ont été vérifiées.`);
        }
      }
    });
  };

  const handleBatchResetFloor = () => {
    const floorRoomIds = rooms
      .filter(room => room.dorm === activeDorm && room.floor === activeFloor)
      .map(r => r.id);
      
    setConfirmDialog({
      message: `Voulez-vous marquer TOUTES les chambres du dortoir ${activeDorm} - ${floors.find(f => f.id === activeFloor).label} comme "NON VÉRIFIÉES" ?`,
      onConfirm: async () => {
        setRooms(prev => prev.map(room => 
          room.dorm === activeDorm && room.floor === activeFloor ? { ...room, validated: false } : room
        ));
        
        if (supabase) {
          const { error } = await supabase
            .from('ibn_timya_rooms')
            .update({ validated: false })
            .in('id', floorRoomIds);
            
          if (error) {
            console.error("Error batch resetting:", error);
            showToast("Erreur de synchronisation par lot. Mis à jour localement uniquement.");
          } else {
            showToast(`Étage ${activeDorm} - ${floors.find(f => f.id === activeFloor).short} réinitialisé en temps réel.`);
          }
        } else {
          const newRooms = rooms.map(room => 
            room.dorm === activeDorm && room.floor === activeFloor ? { ...room, validated: false } : room
          );
          updateRoomsAndUrl(newRooms);
          showToast(`Statut réinitialisé à "Non vérifiée" pour l'étage ${activeDorm} - ${floors.find(f => f.id === activeFloor).short}.`);
        }
      }
    });
  };

  const handleResetAllData = () => {
    setConfirmDialog({
      message: "⚠️ Attention : Cette action va réinitialiser COMPLÈTEMENT toutes les chambres de l'établissement. Voulez-vous continuer ?",
      onConfirm: async () => {
        const reset = generateInitialRooms();
        
        if (supabase) {
          const allRoomIds = rooms.map(r => r.id);
          setRooms(reset);
          const { error } = await supabase
            .from('ibn_timya_rooms')
            .update({ validated: false })
            .in('id', allRoomIds);
            
          if (error) {
            console.error("Error resetting all rooms:", error);
            showToast("Erreur lors de la réinitialisation sur Supabase.");
          } else {
            showToast("Toutes les données ont été réinitialisées en temps réel.");
          }
        } else {
          updateRoomsAndUrl(reset);
          showToast("Toutes les données ont été réinitialisées.");
        }
      }
    });
  };

  // Copy shareable link to Clipboard
  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    showToast("Lien de partage copié dans le presse-papiers !");
  };

  // Import JSON file
  const handleImportJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const fileReader = new FileReader();
    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (Array.isArray(parsed) && parsed.length === 336) {
          const isValid = parsed.every(r => r.id && r.dorm && r.floor !== undefined && r.number && r.validated !== undefined);
          if (isValid) {
            if (supabase) {
              const { error } = await supabase.from('ibn_timya_rooms').upsert(parsed);
              if (error) {
                console.error("Error importing to Supabase:", error);
                showToast("Erreur lors de la synchronisation de l'import sur Supabase.");
              } else {
                setRooms(parsed);
                showToast("Données importées et synchronisées en temps réel !");
              }
            } else {
              updateRoomsAndUrl(parsed);
              showToast("Données importées avec succès !");
            }
          } else {
            alert("Format JSON invalide. Le fichier doit contenir les 336 chambres.");
          }
        } else {
          alert("Fichier JSON non compatible. Le nombre de chambres est incorrect.");
        }
      } catch (err) {
        alert("Erreur lors de la lecture du fichier. Assurez-vous d'importer un fichier JSON valide.");
      }
    };
  };

  // Exporters
  const exportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rooms, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `ibn_timya_chambres_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Données exportées au format JSON.");
  };

  const exportCSV = () => {
    // Generate French formatted CSV with UTF-8 BOM
    let csvContent = "\uFEFFDortoir;Etage;Chambre;Statut\n";
    
    rooms.forEach(r => {
      const floorLabel = floors.find(f => f.id === r.floor)?.label || r.floor;
      const status = r.validated ? "Vérifiée" : "Non vérifiée";
      csvContent += `"${r.dorm}";"${floorLabel}";"Chambre ${r.number}";"${status}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `liberation_chambres_ibn_timya_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Rapport CSV exporté avec succès.");
  };

  const handlePrint = () => {
    window.print();
  };

  // 5. Statistics Calculators
  const totalRooms = rooms.length;
  const validatedRoomsCount = rooms.filter(r => r.validated).length;
  const occupiedRoomsCount = totalRooms - validatedRoomsCount;
  const globalPercentage = Math.round((validatedRoomsCount / totalRooms) * 100) || 0;

  const getDormStats = (dormLetter) => {
    const dormRooms = rooms.filter(r => r.dorm === dormLetter);
    const validated = dormRooms.filter(r => r.validated).length;
    const percent = Math.round((validated / dormRooms.length) * 100) || 0;
    return { validated, total: dormRooms.length, percent };
  };

  const getFloorStats = (dormLetter, floorId) => {
    const floorRooms = rooms.filter(r => r.dorm === dormLetter && r.floor === floorId);
    const validated = floorRooms.filter(r => r.validated).length;
    return { validated, total: floorRooms.length };
  };

  // 6. Filtering Logic
  const filteredRooms = rooms.filter(r => r.dorm === activeDorm && r.floor === activeFloor);

  return (
    <>
      {/* ----------------- Screen Header ----------------- */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand">
            <div className="logo-container">
              <GraduationCap size={24} />
            </div>
            <div className="brand-text">
              <h1>Gestion de Libération des Chambres</h1>
              <p>CPGE Ibn Timya Marrakech • Administrateur</p>
            </div>
          </div>
          
          <div className="header-actions">
            <button 
              className="btn btn-secondary btn-icon-only" 
              onClick={() => setDarkMode(!darkMode)}
              title="Changer de thème"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <div className="container animate-fade">
        {/* Import JSON (hidden input) */}
        <input 
          type="file" 
          id="import-file-trigger" 
          accept=".json" 
          onChange={handleImportJSON} 
          style={{display: 'none'}} 
        />

        {/* ----------------- Dashboard Section ----------------- */}
        <section className="stats-section">
          {/* Global Completion Card */}
          <div className="stats-card overview-card">
            <div className="progress-ring-container">
              {/* Simple SVG Circular Progress Ring */}
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle 
                  cx="55" 
                  cy="55" 
                  r="48" 
                  stroke={darkMode ? '#1e293b' : '#e2e8f0'} 
                  strokeWidth="8" 
                  fill="transparent" 
                />
                <circle 
                  cx="55" 
                  cy="55" 
                  r="48" 
                  stroke="#0f766e" 
                  strokeWidth="8" 
                  fill="transparent" 
                  strokeDasharray="301.6"
                  strokeDashoffset={301.6 - (301.6 * globalPercentage) / 100}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                />
              </svg>
              <div className="progress-text">
                <span className="progress-percent">{globalPercentage}%</span>
                <span className="progress-label">Vérifiées</span>
              </div>
            </div>
            <div className="overview-info">
              <span className="overview-title">Progression Globale</span>
              <div className="overview-value">
                {validatedRoomsCount} <span style={{fontSize: '1.25rem', fontWeight: 500, color: 'var(--text-muted)'}}>/ {totalRooms}</span>
              </div>
              <p className="overview-subtext">
                {occupiedRoomsCount} chambres restent à vérifier.
              </p>
            </div>
          </div>

          {/* Dorm Breakdown Progress */}
          <div className="stats-card">
            <div className="dorms-grid">
              {dorms.map(letter => {
                const stats = getDormStats(letter);
                return (
                  <div key={letter} className="dorm-stat-box">
                    <div className="dorm-stat-header">
                      <span className="dorm-stat-name">Dortoir {letter}</span>
                      <span className="dorm-stat-percent">{stats.percent}%</span>
                    </div>
                    <div className="dorm-progress-bar-container">
                      <div 
                        className="dorm-progress-bar" 
                        style={{ width: `${stats.percent}%` }}
                      />
                    </div>
                    <span className="dorm-stat-count">{stats.validated} / {stats.total} Chambres</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ----------------- Dormitory Tabs ----------------- */}
        <nav className="dorm-tabs">
          {dorms.map(letter => {
            const stats = getDormStats(letter);
            return (
              <div 
                key={letter} 
                className={`dorm-tab ${activeDorm === letter ? 'active' : ''}`}
                onClick={() => setActiveDorm(letter)}
              >
                <span className="dorm-tab-letter">Dortoir {letter}</span>
                <span className="dorm-tab-label">{stats.validated} / {stats.total} Vérifiées</span>
              </div>
            );
          })}
        </nav>

        {/* ----------------- Navigation Layout (Floors sidebar + Room Grid) ----------------- */}
        <div className="navigation-layout">
          {/* Floors Sidebar */}
          <aside className="floors-card">
            <h4 className="floors-card-title">Étages</h4>
            <div className="floor-buttons-list">
              {floors.map(floor => {
                const stats = getFloorStats(activeDorm, floor.id);
                return (
                  <button
                    key={floor.id}
                    className={`floor-button ${activeFloor === floor.id ? 'active' : ''}`}
                    onClick={() => setActiveFloor(floor.id)}
                  >
                    <span>{floor.label}</span>
                    <span className="floor-badge-count">{stats.validated} / {stats.total}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Room Grid Panel */}
          <main className="room-grid-panel">
            <div className="panel-header">
              <div className="panel-title">
                <h3>
                  Dortoir {activeDorm} • {floors.find(f => f.id === activeFloor).label}
                </h3>
                <p>Cliquez sur une chambre pour modifier son état (Vérifiée/Non vérifiée)</p>
              </div>
              
              <div className="panel-actions">
                <button className="btn btn-outline btn-sm" onClick={handleBatchValidateFloor}>
                  Vérifier tout l'étage
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleBatchResetFloor} title="Réinitialiser l'étage">
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            <div className="rooms-grid">
              {filteredRooms.map(room => {
                return (
                  <div 
                    key={room.id} 
                    className={`room-card ${room.validated ? 'validated' : 'occupied'}`}
                    onClick={() => handleToggleValidation(room.id)}
                  >
                    <div className="room-card-header">
                      <span className="room-number">Ch.{room.number}</span>
                      <span className="room-card-status-dot" />
                    </div>

                    <div className="room-card-actions">
                      <span className="room-card-badge">
                        {room.validated ? 'Vérifiée' : 'Non vérifiée'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredRooms.length === 0 && (
                <div className="empty-results">
                  <AlertTriangle size={36} />
                  <p>Aucune chambre ne correspond à vos filtres.</p>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Footer */}
        <footer className="app-footer">
          <p>© {new Date().getFullYear()} CPGE Ibn Timya Marrakech &nbsp;•&nbsp; <label htmlFor="import-file-trigger" style={{cursor:'pointer', color:'var(--primary-color)', textDecoration:'underline'}}>Importer JSON</label></p>
        </footer>
      </div>

      {/* ----------------- Custom Confirmation Modal ----------------- */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div 
            className="modal-content animate-scale" 
            style={{ maxWidth: '400px' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
                <AlertTriangle size={20} />
                Confirmation
              </h4>
              <button className="modal-close-btn" onClick={() => setConfirmDialog(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '1.25rem 1.5rem', fontSize: '0.95rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </div>
            
            <div className="modal-footer" style={{ borderTop: 'none', background: 'transparent' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDialog(null)}>
                Annuler
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Supabase Sync Settings Modal ----------------- */}
      {isSyncModalOpen && (
        <div className="modal-overlay" onClick={() => setIsSyncModalOpen(false)}>
          <div 
            className="modal-content animate-scale" 
            style={{ maxWidth: '500px' }} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
                <Database size={20} />
                Synchronisation en Temps Réel
              </h4>
              <button className="modal-close-btn" onClick={() => setIsSyncModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Connectez l'application à votre propre base de données <strong>Supabase</strong> gratuite pour permettre à plusieurs personnes de cocher/décocher les chambres simultanément en temps réel.
              </p>
              
              <div className="form-group" style={{ marginTop: '0.5rem' }}>
                <label>Supabase Project URL</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="https://xxxxxx.supabase.co" 
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Supabase Anon Key</label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Clé API publique (anon key)" 
                  value={supabaseAnonKey}
                  onChange={(e) => setSupabaseAnonKey(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                <input 
                  type="checkbox" 
                  id="sync-active-toggle"
                  checked={isSyncActive}
                  onChange={(e) => setIsSyncActive(e.target.checked)}
                  style={{ width: '1.1rem', height: '1.1rem', accentColor: 'var(--primary-color)' }}
                />
                <label htmlFor="sync-active-toggle" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
                  Activer la synchronisation en direct
                </label>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <h5 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Guide de configuration rapide (Gratuit)
                </h5>
                <ol style={{ fontSize: '0.8rem', paddingLeft: '1.2rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <li>Créez un compte gratuit sur <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{color: 'var(--primary-color)'}}>supabase.com</a>.</li>
                  <li>Créez un nouveau projet (ex: <code>LiberationRooms</code>).</li>
                  <li>Ouvrez le <strong>SQL Editor</strong>, collez le script ci-dessous, puis cliquez sur <strong>Run</strong> :</li>
                </ol>
                
                <div style={{ position: 'relative', marginTop: '0.5rem' }}>
                  <pre style={{ 
                    backgroundColor: 'var(--bg-app)', 
                    padding: '0.75rem', 
                    borderRadius: '0.5rem', 
                    fontSize: '0.75rem', 
                    overflowX: 'auto',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    maxHeight: '120px'
                  }}>
{`CREATE TABLE ibn_timya_rooms (
  id TEXT PRIMARY KEY,
  dorm TEXT NOT NULL,
  floor INTEGER NOT NULL,
  number INTEGER NOT NULL,
  validated BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE ibn_timya_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès Public" ON ibn_timya_rooms FOR ALL USING (true) WITH CHECK (true);`}
                  </pre>
                  <button 
                    className="btn btn-secondary btn-icon-only btn-sm"
                    style={{ position: 'absolute', right: '0.5rem', top: '0.5rem' }}
                    onClick={() => {
                      navigator.clipboard.writeText(
`CREATE TABLE ibn_timya_rooms (
  id TEXT PRIMARY KEY,
  dorm TEXT NOT NULL,
  floor INTEGER NOT NULL,
  number INTEGER NOT NULL,
  validated BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE ibn_timya_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Accès Public" ON ibn_timya_rooms FOR ALL USING (true) WITH CHECK (true);`
                      );
                      showToast("Code SQL copié !");
                    }}
                    title="Copier le code SQL"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => {
                  setIsSyncActive(false);
                  localStorage.removeItem('ibn_timya_supabase_active');
                  setIsSyncModalOpen(false);
                  showToast("Synchronisation désactivée.");
                }}
              >
                Désactiver
              </button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={() => {
                  if (isSyncActive && (!supabaseUrl || !supabaseAnonKey)) {
                    alert("Veuillez remplir l'URL et la clé API pour activer la synchronisation.");
                    return;
                  }
                  
                  localStorage.setItem('ibn_timya_supabase_url', supabaseUrl.trim());
                  localStorage.setItem('ibn_timya_supabase_key', supabaseAnonKey.trim());
                  localStorage.setItem('ibn_timya_supabase_active', isSyncActive ? 'true' : 'false');
                  
                  setIsSyncModalOpen(false);
                  showToast(isSyncActive ? "Configuration enregistrée. Connexion en cours..." : "Configuration hors-ligne enregistrée.");
                }}
              >
                Enregistrer & Connexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- Notification Toast ----------------- */}
      {toastMessage && (
        <div className="toast animate-scale">
          <Check size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ----------------- Print Only Hidden Content ----------------- */}
      <div className="print-only-table">
        <h1 style={{ textAlign: 'center', marginBottom: '0.5cm' }}>CPGE IBN TIMYA MARRAKECH</h1>
        <h2 style={{ textAlign: 'center', marginBottom: '1cm' }}>Rapport de Libération des Dortoirs - Année {new Date().getFullYear()}</h2>
        <p style={{ marginBottom: '0.5cm' }}>
          <strong>Date d'édition :</strong> {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR')} <br />
          <strong>Progression globale :</strong> {validatedRoomsCount} / {totalRooms} chambres libérées ({globalPercentage}%)
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1cm' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Dortoir</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Étage</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>Chambre</th>
              <th style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>État de Vérification</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id} style={{ pageBreakInside: 'avoid' }}>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>Dortoir {r.dorm}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>{floors.find(f => f.id === r.floor).label}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>Chambre {r.number}</td>
                <td style={{ border: '1px solid #ddd', padding: '8px', fontWeight: 'bold', color: r.validated ? 'green' : 'red' }}>
                  {r.validated ? 'VÉRIFIÉE' : 'NON VÉRIFIÉE'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div style={{ marginTop: '2cm', display: 'flex', justifyContent: 'space-between', pageBreakInside: 'avoid' }}>
          <div>
            <p><strong>Signature du Maître d'Internat :</strong></p>
            <div style={{ height: '2cm' }}></div>
            <p>_______________________</p>
          </div>
          <div>
            <p><strong>Visa du Directeur des CPGE :</strong></p>
            <div style={{ height: '2cm' }}></div>
            <p>_______________________</p>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
