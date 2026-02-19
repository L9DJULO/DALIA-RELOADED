import { useState, useEffect, useRef, useCallback } from 'react';
import { Network, Search, X } from 'lucide-react';
import { fetchEmbeddings, fetchSimilarChampions } from '../../services/api';
import RoleIcon from '../RoleIcon';

const CLUSTER_COLORS = [
  { dot: 'bg-amber-400', ring: 'ring-amber-400/30', text: 'text-amber-400' },
  { dot: 'bg-sky-400',   ring: 'ring-sky-400/30',   text: 'text-sky-400' },
  { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', text: 'text-emerald-400' },
  { dot: 'bg-purple-400', ring: 'ring-purple-400/30', text: 'text-purple-400' },
  { dot: 'bg-red-400',   ring: 'ring-red-400/30',   text: 'text-red-400' },
];

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

/* ── Scatter plot (canvas-based for performance) ── */
function EmbeddingScatter({ embeddings, selected, onSelect }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredIdx, setHoveredIdx] = useState(-1);
  const [tooltip, setTooltip] = useState(null);
  const pointsRef = useRef([]);

  // Compute normalized coordinates
  const points = useRef([]);
  useEffect(() => {
    if (!embeddings.length) return;
    const xs = embeddings.map((e) => e.x);
    const ys = embeddings.map((e) => e.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const pad = 0.08;
    points.current = embeddings.map((e) => ({
      ...e,
      nx: pad + ((e.x - minX) / rangeX) * (1 - 2 * pad),
      ny: pad + ((e.y - minY) / rangeY) * (1 - 2 * pad),
    }));
    pointsRef.current = points.current;
  }, [embeddings]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !points.current.length) return;

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * w;
      const y = (i / 10) * h;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const colors = ['#fbbf24', '#38bdf8', '#34d399', '#a78bfa', '#f87171'];

    points.current.forEach((p, i) => {
      const px = p.nx * w;
      const py = p.ny * h;
      const isSelected = selected && p.champion_id === selected;
      const isHovered = i === hoveredIdx;
      const r = isSelected ? 8 : isHovered ? 7 : 4;

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = colors[p.cluster % 5] || colors[0];
      ctx.globalAlpha = isSelected || isHovered ? 1.0 : 0.65;
      ctx.fill();

      if (isSelected || isHovered) {
        ctx.strokeStyle = colors[p.cluster % 5];
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(px, py, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1.0;

      // Label for selected/hovered
      if (isSelected || isHovered) {
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.fillText(p.champion_name, px, py - r - 6);
      }
    });
  }, [embeddings, selected, hoveredIdx]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    let closest = -1;
    let minDist = 20;
    pointsRef.current.forEach((p, i) => {
      const px = p.nx * w;
      const py = p.ny * h;
      const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    });
    setHoveredIdx(closest);
    if (closest >= 0) {
      const p = pointsRef.current[closest];
      setTooltip({ name: p.champion_name, cluster: p.cluster, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleClick = useCallback(() => {
    if (hoveredIdx >= 0) {
      onSelect(pointsRef.current[hoveredIdx].champion_id);
    }
  }, [hoveredIdx, onSelect]);

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[300px]">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredIdx(-1); setTooltip(null); }}
        onClick={handleClick}
      />
      {tooltip && (
        <div
          className="absolute pointer-events-none z-30 px-2 py-1 rounded-md bg-slate-700 border border-slate-600 text-[11px] text-slate-200 shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <span className={CLUSTER_COLORS[tooltip.cluster % 5]?.text}>{tooltip.name}</span>
        </div>
      )}
    </div>
  );
}

/* ── Similar champions list ── */
function SimilarList({ similar, onSelect }) {
  if (!similar.length) return null;
  return (
    <div className="space-y-1">
      {similar.map((s) => (
        <button
          key={s.champion_id}
          onClick={() => onSelect(s.champion_id)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-elevated/40
                     hover:bg-surface-elevated border border-transparent hover:border-slate-700/50
                     transition-colors text-left"
        >
          <img src={s.image_url} alt={s.champion_name} className="w-7 h-7 rounded-md" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] text-slate-200 font-medium truncate">{s.champion_name}</div>
          </div>
          <div className="text-[11px] text-amber-400 font-medium tabular-nums">
            {(s.similarity * 100).toFixed(0)}%
          </div>
        </button>
      ))}
    </div>
  );
}

/* ── Main component ── */
export default function ChampionEmbeddings() {
  const [role, setRole] = useState('mid');
  const [embeddings, setEmbeddings] = useState([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  // Load embeddings for role
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmbeddings(role)
      .then((data) => {
        if (cancelled) return;
        setEmbeddings(data.embeddings || []);
        setAvailable(data.available || false);
        setSelectedId(null);
        setSimilar([]);
      })
      .catch(() => {
        if (!cancelled) { setEmbeddings([]); setAvailable(false); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role]);

  // Load similar champions when selection changes
  useEffect(() => {
    if (!selectedId || !available) { setSimilar([]); return; }
    let cancelled = false;
    setSimilarLoading(true);
    fetchSimilarChampions(selectedId, role, 8)
      .then((data) => { if (!cancelled) setSimilar(data.similar || []); })
      .catch(() => { if (!cancelled) setSimilar([]); })
      .finally(() => { if (!cancelled) setSimilarLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, role, available]);

  const selectedChamp = embeddings.find((e) => e.champion_id === selectedId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="relative w-8 h-8 mx-auto mb-2">
            <div className="absolute inset-0 border-2 border-slate-700 rounded-full" />
            <div className="absolute inset-0 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-[11px] text-slate-500">Chargement des embeddings…</div>
        </div>
      </div>
    );
  }

  if (!available || !embeddings.length) {
    return (
      <div className="flex items-center justify-center h-48 text-center">
        <div>
          <Network size={24} className="text-slate-600 mx-auto mb-2" />
          <div className="text-sm text-slate-400">Modèle IA non disponible</div>
          <div className="text-[11px] text-slate-500 mt-1">Entraînez le modèle pour explorer les embeddings.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Role selector */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-slate-500 font-medium">Rôle</span>
        <div className="flex gap-0.5 bg-surface-elevated rounded-lg p-0.5">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                role === r
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <RoleIcon role={r} size={12} />
              <span className="capitalize">{r}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cluster legend */}
      <div className="flex items-center gap-3 text-[10px]">
        <span className="text-slate-500">Clusters :</span>
        {CLUSTER_COLORS.map((c, i) => (
          <span key={i} className={`flex items-center gap-1 ${c.text}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            {i + 1}
          </span>
        ))}
      </div>

      <div className="flex gap-3 h-[400px]">
        {/* Scatter plot */}
        <div className="flex-1 rounded-lg border border-slate-700/50 bg-surface-elevated/30 overflow-hidden">
          <EmbeddingScatter
            embeddings={embeddings}
            selected={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Side panel: selected champion + similar */}
        <div className="w-52 shrink-0 space-y-3 overflow-y-auto">
          {selectedChamp ? (
            <>
              <div className="rounded-lg border border-slate-700/50 bg-surface p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={selectedChamp.image_url}
                    alt={selectedChamp.champion_name}
                    className="w-9 h-9 rounded-lg border border-slate-700"
                  />
                  <div>
                    <div className="text-sm text-slate-100 font-semibold">{selectedChamp.champion_name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${CLUSTER_COLORS[selectedChamp.cluster % 5].dot}`} />
                      <span className="text-[10px] text-slate-500">Cluster {selectedChamp.cluster + 1}</span>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedId(null); setSimilar([]); }} className="ml-auto p-1 rounded hover:bg-surface-elevated text-slate-500">
                    <X size={12} />
                  </button>
                </div>
                {selectedChamp.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedChamp.tags.map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">{t}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-medium text-slate-400 mb-1.5 flex items-center gap-1">
                  <Search size={11} />
                  Champions similaires
                </div>
                {similarLoading ? (
                  <div className="text-[11px] text-slate-500 text-center py-4">Chargement…</div>
                ) : (
                  <SimilarList similar={similar} onSelect={setSelectedId} />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <Search size={18} className="text-slate-600 mx-auto mb-2" />
                <div className="text-[11px] text-slate-500">
                  Cliquez sur un champion pour voir les alternatives similaires
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
