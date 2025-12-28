import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ChevronDown, ExternalLink, Plus, Minus, Pencil } from 'lucide-react';
import { MobileBottomNav } from '../components/MobileBottomNav';
import { normalizeReel } from '../services/normalizeReel';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5001";

const IOSShareIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
  </svg>
);

const linkifyText = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.split(urlRegex).map((part, index) => 
    part.match(urlRegex) ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 underline">{part}</a>
    ) : part
  );
};

const scaleQuantity = (quantity: string, scale: number): string => {
  if (scale === 1) return quantity;
  const match = quantity.match(/^(\d+(?:\/\d+)?|\d+\.\d+)\s*(.*)$/);
  if (!match) return quantity;
  
  const [, num, unit] = match;
  const scaled = num.includes('/') 
    ? (num.split('/').map(Number).reduce((a, b) => a / b) * scale)
    : parseFloat(num) * scale;
  
  return `${scaled % 1 === 0 ? scaled : scaled.toFixed(1)} ${unit}`.trim();
};

export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [servingScale, setServingScale] = useState(1);
  const [editingCategory, setEditingCategory] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const [tempCategory, setTempCategory] = useState('');
  const [tempTopic, setTempTopic] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/saved_reels`)
      .then(res => res.json())
      .then(rows => {
        const found = rows.find((r: any) => r.id === id || r.process_id === id);
        if (found) setVideo(normalizeReel(found));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    await fetch(`${API_BASE}/api/delete_reel/${video.process_id}`, { method: 'DELETE' });
    navigate('/gallery/all');
  };

  const handleShare = async () => {
    const shareData = { title, text: `Check out this reel: ${title}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link copied to clipboard!');
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  const handleSaveCategory = async () => {
    if (!tempCategory.trim()) return;
    // TODO: Add API call to update category
    if (video.summary) {
      video.summary.category = tempCategory;
    }
    setEditingCategory(false);
  };

  const handleSaveTopic = async () => {
    if (!tempTopic.trim()) return;
    // TODO: Add API call to update topic
    if (video.summary) {
      video.summary.topic = tempTopic;
    }
    setEditingTopic(false);
  };

  if (loading) return <div className="p-10 text-center"><div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div><p className="mt-4 text-gray-500">Loading...</p></div>;
  if (!video) return <div className="p-10 text-center">Video not found</div>;

  const isRecipe = video.content_type === 'recipe' && video.recipe;
  const title = isRecipe ? video.recipe.title : (video.summary?.title || 'Untitled');
  const author = video.author_name || 'Unknown';
  const category = video.summary?.category || 'General';
  const topic = video.summary?.topic || '';
  const bullets = video.summary?.bullets || [];
  const emojis = video.summary?.emojis?.filter((e: string) => e && e.trim()) || [];
  const savedAt = new Date(video.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const scaledServings = (video.recipe?.servings || 1) * servingScale;

  // ✅ SHARED COMPONENTS
  const RecipeMeta = ({ mobile = false }) => (
    video.recipe && (video.recipe.prep_time || video.recipe.cook_time || video.recipe.servings) && (
      <div className={`bg-white border border-gray-200 rounded-xl ${mobile ? 'p-3' : 'p-6'}`}>
        <div className="grid grid-cols-3 gap-4 text-center">
          {video.recipe.prep_time && (
            <div>
              <p className={`font-bold text-gray-900 ${mobile ? 'text-base' : 'text-2xl'}`}>{video.recipe.prep_time}</p>
              <p className={`text-gray-600 mt-1 ${mobile ? 'text-xs' : 'text-sm'}`}>{mobile ? 'Prep' : 'Prep Time'}</p>
            </div>
          )}
          {video.recipe.cook_time && (
            <div>
              <p className={`font-bold text-gray-900 ${mobile ? 'text-base' : 'text-2xl'}`}>{video.recipe.cook_time}</p>
              <p className={`text-gray-600 mt-1 ${mobile ? 'text-xs' : 'text-sm'}`}>{mobile ? 'Cook' : 'Cook Time'}</p>
            </div>
          )}
          {video.recipe.servings && (
            <div>
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setServingScale(Math.max(0.5, servingScale - 0.5))} className={`bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition ${mobile ? 'w-5 h-5' : 'w-7 h-7'}`} disabled={servingScale <= 0.5}>
                  <Minus size={mobile ? 10 : 14} />
                </button>
                <p className={`font-bold text-gray-900 text-center ${mobile ? 'text-base min-w-[28px]' : 'text-2xl min-w-[40px]'}`}>{scaledServings}</p>
                <button onClick={() => setServingScale(servingScale + 0.5)} className={`bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition ${mobile ? 'w-5 h-5' : 'w-7 h-7'}`}>
                  <Plus size={mobile ? 10 : 14} />
                </button>
              </div>
              <p className={`text-gray-600 mt-1 ${mobile ? 'text-xs' : 'text-sm'}`}>Servings</p>
            </div>
          )}
        </div>
      </div>
    )
  );

  const Ingredients = ({ mobile = false }) => {
    // ✅ FIX 1: Improved quantity parsing with consistent spacing
    const parseQuantity = (quantity: string) => {
      // Normalize: ensure single space after number
      const normalized = quantity.replace(/^(\d+(?:\/\d+)?|\d+\.\d+)\s*/, '$1 ').trim();
      
      const match = normalized.match(/^(\d+(?:\/\d+)?|\d+\.\d+)\s+(.+)$/);
      if (match) {
        return { number: match[1], unit: match[2] };
      }
      // If no space found, check if it's just a number
      if (normalized.match(/^(\d+(?:\/\d+)?|\d+\.\d+)$/)) {
        return { number: normalized, unit: '' };
      }
      // Otherwise it's all unit
      return { number: '', unit: normalized };
    };

    return video.recipe?.ingredients?.length > 0 && (
      <div className={`bg-white border border-gray-200 rounded-xl ${mobile ? 'p-3' : 'p-6'}`}>
        <h2 className={`font-bold text-gray-900 mb-4 ${mobile ? 'text-sm' : 'text-xl'}`}>Ingredients</h2>
        <ul className={mobile ? 'space-y-1.5' : 'space-y-3'}>
          {video.recipe.ingredients.map((ing: any, idx: number) => {
            const scaledQty = scaleQuantity(ing.quantity, servingScale);
            const { number, unit } = parseQuantity(scaledQty);
            
            return (
              <li key={idx} className={`flex flex-wrap items-baseline ${mobile ? 'gap-1.5' : 'gap-2'}`}>
                {/* Emoji */}
                <span className={mobile ? 'text-sm' : 'text-lg'}>{ing.emoji || '🔸'}</span>
                
                {/* Number + Unit together with minimal gap */}
                <div className="flex items-baseline gap-0.5">
                  {/* Number: purple + bold */}
                  {number && (
                    <span className={`font-bold text-purple-600 ${mobile ? 'text-xs' : 'text-base'}`}>
                      {number}
                    </span>
                  )}
                  
                  {/* Unit: black + bold */}
                  {unit && (
                    <span className={`font-bold text-gray-900 ${mobile ? 'text-xs' : 'text-base'}`}>
                      {unit}
                    </span>
                  )}
                </div>
                
                {/* Item: black + normal weight */}
                <span className={`font-normal text-gray-900 ${mobile ? 'text-xs' : 'text-base'}`}>
                  {ing.item}
                </span>
                
                {/* Notes: gray italic + SAME SIZE as item */}
                {ing.notes && (
                  <span className={`font-normal text-gray-500 italic ${mobile ? 'text-xs' : 'text-base'}`}>
                    {ing.notes}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const Steps = ({ mobile = false }) => (
    video.recipe?.steps?.length > 0 && (
      <div className={`bg-white border border-gray-200 rounded-xl ${mobile ? 'p-3' : 'p-6'}`}>
        <h2 className={`font-bold text-gray-900 mb-4 ${mobile ? 'text-sm' : 'text-xl'}`}>Directions</h2>
        <ol className={mobile ? 'space-y-2' : 'space-y-4'}>
          {video.recipe.steps.map((step: string, idx: number) => (
            <li key={idx} className={`flex items-start ${mobile ? 'gap-2' : 'gap-4'}`}>
              <span className={`flex-shrink-0 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold ${mobile ? 'w-5 h-5 text-xs' : 'w-7 h-7 text-xs mt-1'}`}>{idx + 1}</span>
              <p className={`text-gray-700 leading-relaxed flex-1 ${mobile ? 'text-xs' : 'text-base'}`}>{step}</p>
            </li>
          ))}
        </ol>
      </div>
    )
  );

  const Tags = ({ mobile = false }) => {
    const tags = video.summary?.hashtags || [];
    return tags.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {tags.map((tag: string) => {
          const cleanTag = tag.replace('#', '');
          return (
            <a key={tag} href={`https://www.instagram.com/explore/tags/${cleanTag}/`} target="_blank" rel="noopener noreferrer" className={`${mobile ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs'} bg-violet-100 text-violet-700 font-medium rounded-full hover:bg-violet-200 transition`}>
              #{cleanTag}
            </a>
          );
        })}
      </div>
    );
  };

  return (
    <div className="animate-fade-in pb-2 md:pb-12">
      {/* Desktop */}
      <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-12 items-start">
        <div className="min-w-0">
          <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6 group">
            <div className="absolute top-4 left-0 right-0 px-4 flex justify-between items-start z-10">
              <button onClick={() => navigate(-1)} className="p-2.5 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-black/30">
                <ArrowLeft size={20} />
              </button>
              <button onClick={handleShare} className="p-2.5 bg-black/20 backdrop-blur-md rounded-full text-white hover:bg-black/30">
                <IOSShareIcon size={18} />
              </button>
            </div>
            <img src={video.gcs_urls?.preview_thumbnail || video.gcs_urls?.thumbnail} alt={title} className="w-full h-full object-cover opacity-90" />
            {video.duration && video.duration !== '0:00' && <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2 py-1 rounded">{video.duration}</div>}
          </div>

          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-3">{title}</h1>

          <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-100">
            <a href={`https://www.instagram.com/${author.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:opacity-80">
              <img src="/instagram_logo.png" alt="Instagram" className="w-8 h-8 rounded-full" />
              <div className="text-sm font-semibold text-gray-900">@{author.replace('@', '')}</div>
            </a>
            <div className="text-sm text-gray-500">Saved on {savedAt}</div>
          </div>

          {isRecipe && video.recipe && (
            <div className="space-y-6 mb-8">
              {video.recipe.description && <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6"><p className="text-gray-800 leading-relaxed">{video.recipe.description}</p></div>}
              <RecipeMeta />
              <Ingredients />
              <Steps />
              {video.recipe.tips?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                  <h2 className="text-lg font-bold text-amber-900 mb-3">💡 Tips</h2>
                  <ul className="space-y-2">{video.recipe.tips.map((tip: string, idx: number) => <li key={idx} className="text-amber-900 leading-relaxed">• {tip}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {!isRecipe && bullets.length > 0 && (
            <ul className="space-y-3 mb-8">
              {bullets.map((b: any, i: number) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="text-lg min-w-[24px]">{emojis[i] || '•'}</span>
                  <div className="flex-1"><p className="text-sm font-semibold text-gray-900 mb-1">{b.headline}</p><p className="text-sm text-gray-700">{b.text}</p></div>
                </li>
              ))}
            </ul>
          )}

          {video.caption && (
            <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setCaptionOpen(!captionOpen)} className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 font-medium text-gray-900">
                <span>Original Caption</span>
                <ChevronDown className={`w-5 h-5 transition-transform ${captionOpen ? 'rotate-180' : ''}`} />
              </button>
              {captionOpen && <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-sm text-gray-700 whitespace-pre-line">{linkifyText(video.caption)}</div>}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <button onClick={() => setConfirmDelete(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"><Trash2 className="w-5 h-5" />Delete Reel</button>
          
          {/* ✅ FIX 2: Changed "Original Source" to "See original" */}
          {video.source_url && (
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 p-6 border border-violet-200 rounded-lg">
              <div className="text-xs uppercase tracking-wide text-violet-900 font-semibold mb-3">See original</div>
              <a href={video.source_url} target="_blank" rel="noopener noreferrer">
                <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-white font-medium shadow-md bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90">
                  <ExternalLink className="w-4 h-4" />View on Instagram
                </button>
              </a>
            </div>
          )}
          
          {/* ✅ FIX 3: Category with edit button */}
          {category && (
            <div className="bg-white border border-gray-200 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase text-gray-500 font-semibold">Category</div>
                <button onClick={() => { setTempCategory(category); setEditingCategory(true); }} className="p-1 hover:bg-gray-100 rounded transition">
                  <Pencil size={14} className="text-gray-500" />
                </button>
              </div>
              {editingCategory ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempCategory}
                    onChange={(e) => setTempCategory(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                  <button onClick={handleSaveCategory} className="px-3 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700">Save</button>
                  <button onClick={() => setEditingCategory(false)} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">Cancel</button>
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-900">{category}</p>
              )}
            </div>
          )}
          
          {/* ✅ FIX 3: Topic with edit button */}
          {topic && (
            <div className="bg-white border border-gray-200 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase text-gray-500 font-semibold">Topic</div>
                <button onClick={() => { setTempTopic(topic); setEditingTopic(true); }} className="p-1 hover:bg-gray-100 rounded transition">
                  <Pencil size={14} className="text-gray-500" />
                </button>
              </div>
              {editingTopic ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempTopic}
                    onChange={(e) => setTempTopic(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-500"
                    autoFocus
                  />
                  <button onClick={handleSaveTopic} className="px-3 py-1 bg-primary-600 text-white text-xs rounded hover:bg-primary-700">Save</button>
                  <button onClick={() => setEditingTopic(false)} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">Cancel</button>
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-900">{topic}</p>
              )}
            </div>
          )}
          
          {(video.summary?.hashtags?.length > 0) && <div className="bg-white border border-gray-200 p-6 rounded-lg"><div className="text-xs uppercase text-gray-500 font-semibold mb-3">Hashtags</div><Tags /></div>}
          {video.transcription?.transcript && video.transcription.transcript !== 'No transcript available' && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setTranscriptOpen(!transcriptOpen)} className="w-full flex items-center justify-between p-5 bg-white hover:bg-gray-50">
                <span className="font-semibold text-gray-900">Transcript</span>
                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">{transcriptOpen ? 'Hide' : 'Show'}<ChevronDown size={18} className={`transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} /></div>
              </button>
              {transcriptOpen && <div className="p-6 pt-4 bg-gray-50 border-t border-gray-200"><p className="text-gray-600 leading-relaxed text-sm whitespace-pre-wrap">{video.transcription.transcript}</p></div>}
            </div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="md:hidden -mx-4 sm:mx-0">
        <div className="relative w-full aspect-[9/8] bg-black">
          <img src={video.gcs_urls?.preview_thumbnail || video.gcs_urls?.thumbnail} alt={title} className="w-full h-full object-cover opacity-90" />
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent">
            <button onClick={() => navigate(-1)} className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white"><ArrowLeft size={24} /></button>
            <button onClick={handleShare} className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white"><IOSShareIcon size={20} /></button>
          </div>
          {video.duration && video.duration !== '0:00' && <div className="absolute bottom-3 right-3 bg-black/80 text-white text-xs px-2 py-1 rounded">{video.duration}</div>}
        </div>

        <div className="px-4 pt-5 pb-6">
          <h1 className="text-xl font-bold text-gray-900 leading-tight mb-3">{title}</h1>
          <div className="flex items-center justify-between mb-3">
            <a href={`https://www.instagram.com/${author.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80">
              <img src="/instagram_logo.png" alt="Instagram" className="w-5 h-5 rounded-full" />
              <span className="text-sm font-semibold text-gray-900">@{author.replace('@', '')}</span>
            </a>
            <span className="text-xs text-gray-500">{savedAt}</span>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-bold uppercase tracking-wide">{category}</span>
            {topic && <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium">{topic}</span>}
          </div>

          {(video.summary?.hashtags?.length > 0) && <div className="mb-6"><Tags mobile /></div>}

          {isRecipe && video.recipe && (
            <div className="space-y-3 mb-5">
              {video.recipe.description && <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs text-gray-800 leading-relaxed">{video.recipe.description}</p></div>}
              <RecipeMeta mobile />
              <Ingredients mobile />
              <Steps mobile />
              {video.recipe.tips?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <h3 className="text-xs font-bold text-amber-900 mb-1.5">💡 Tips</h3>
                  <ul className="space-y-1">{video.recipe.tips.map((tip: string, idx: number) => <li key={idx} className="text-xs text-amber-900 leading-relaxed">• {tip}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {!isRecipe && bullets.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-5 mb-6">
              <ul className="space-y-3">
                {bullets.map((b: any, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-base">{emojis[i] || '•'}</span>
                    <div className="flex-1"><p className="text-sm font-semibold text-gray-900 mb-1">{b.headline}</p><p className="text-sm text-gray-600">{b.text}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {video.caption && (
            <div className="border-t border-gray-100 pt-4 mb-4">
              <button onClick={() => setCaptionOpen(!captionOpen)} className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
                Original Caption<ChevronDown size={16} className={`transition-transform ${captionOpen ? 'rotate-180' : ''}`} />
              </button>
              {captionOpen && <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{linkifyText(video.caption)}</p>}
            </div>
          )}

          {video.transcription?.transcript && video.transcription.transcript !== 'No transcript available' && (
            <div className="border-t border-gray-100 pt-4 mb-6">
              <button onClick={() => setTranscriptOpen(!transcriptOpen)} className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3">
                Transcript<ChevronDown size={16} className={`transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
              </button>
              {transcriptOpen && <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">{video.transcription.transcript}</p>}
            </div>
          )}

          <div className="flex gap-3 mb-6">
            {video.source_url && (
              <a href={video.source_url} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white rounded-xl text-sm font-bold shadow-md">
                <ExternalLink size={16} />Open on Instagram
              </a>
            )}
            <button onClick={() => setConfirmDelete(true)} className="px-4 py-3 text-red-600 bg-red-50 rounded-xl"><Trash2 size={20} /></button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-sm p-6 text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Delete this reel?</h2>
            <p className="text-sm text-gray-600 mb-6">This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmDelete(false)} className="px-5 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Cancel</button>
              <button onClick={handleDelete} className="px-5 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav onAddClick={() => {}} />
    </div>
  );
};
