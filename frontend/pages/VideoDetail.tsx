import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ChevronDown, Play, Heart, FolderInput } from 'lucide-react';
import { MOCK_VIDEOS } from '../data/mockData';
import { Button } from '../components/Button';
import { MobileBottomNav } from '../components/MobileBottomNav';


// iOS Share Icon (Arrow Up from Box)
const IOSShareIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v13"/>
    <path d="m16 6-4-4-4 4"/>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
  </svg>
);


// Instagram External Link Icon
const InstagramExternalIcon = ({ size = 16 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6"/>
    <path d="M10 14 21 3"/>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
  </svg>
);


export const VideoDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const video = MOCK_VIDEOS.find(v => v.id === id);
  const [transcriptOpen, setTranscriptOpen] = useState(false);


  if (!video) {
    return <div className="p-10 text-center">Video not found</div>;
  }


  return (
    <div className="animate-fade-in pb-2 md:pb-12">
      
      {/* Desktop Breadcrumb */}
      <div className="hidden md:flex items-center gap-2 mb-6 text-sm text-gray-500">
        <button onClick={() => navigate(-1)} className="hover:text-gray-900 flex items-center gap-2 transition-colors font-medium group">
           <div className="p-1.5 bg-white border border-gray-200 rounded-lg group-hover:bg-gray-50 transition-colors">
             <ArrowLeft size={16} />
           </div>
           Back to gallery
        </button>
      </div>


      {/* Desktop Layout (2 Columns) */}
      <div className="hidden md:grid md:grid-cols-[1.5fr_1fr] gap-12 items-start">
        
        {/* Left Column */}
        <div className="min-w-0">
          {/* Poster - Aspect 9:8 */}
          <div className="relative w-full aspect-[9/8] bg-black rounded-2xl overflow-hidden shadow-sm border border-gray-100 mb-6 group">
            <img 
              src={video.thumbnailUrl} 
              alt={video.title} 
              className="w-full h-full object-cover opacity-90"
            />
             <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors cursor-pointer">
                <div className="w-20 h-20 bg-white/30 backdrop-blur-md rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform duration-300 border border-white/40">
                   <Play size={32} fill="currentColor" className="ml-1" />
                </div>
            </div>
          </div>


          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 leading-tight mb-3">
            {video.title}
          </h1>


          <div className="flex items-center gap-3 text-gray-500 text-sm font-medium mb-8 pb-6 border-b border-gray-100">
             <span className="text-gray-900 font-bold">{video.author}</span>
             <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
             <span>{video.savedAt}</span>
             <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
             <span>{video.duration}</span>
          </div>


          {/* Summary */}
          <div className="bg-primary-50/40 rounded-2xl p-6 mb-6">
             <h3 className="text-primary-700 font-bold mb-3 text-sm uppercase tracking-wide">AI Summary</h3>
             <p className="text-gray-700 leading-relaxed mb-4 font-medium">
               {video.summary}
             </p>
             <ul className="space-y-3">
               {video.bullets.map((bullet, idx) => (
                 <li key={idx} className="flex items-start gap-3 text-gray-600 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-400 mt-2 flex-shrink-0"></div>
                    <span className="leading-relaxed">{bullet}</span>
                 </li>
               ))}
             </ul>
          </div>


          {/* Transcript */}
           <div className="border border-gray-200 rounded-2xl overflow-hidden mb-8">
              <button 
                onClick={() => setTranscriptOpen(!transcriptOpen)}
                className="w-full flex items-center justify-between p-5 bg-white hover:bg-gray-50 transition-colors text-left"
              >
                <span className="font-semibold text-gray-900">Transcript</span>
                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                   {transcriptOpen ? 'Hide' : 'Show'}
                   <ChevronDown size={18} className={`transition-transform duration-300 ${transcriptOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              
              {transcriptOpen && (
                <div className="p-6 pt-0 bg-white">
                   <p className="text-gray-600 leading-relaxed text-sm whitespace-pre-wrap">
                     {video.transcript}
                   </p>
                </div>
              )}
           </div>
           
           {/* Desktop Actions */}
           <div className="flex gap-3">
              <Button variant="outline" className="gap-2"><Heart size={18} /> Like</Button>
              <Button variant="outline" className="gap-2"><IOSShareIcon size={16} /> Share</Button>
              <Button variant="outline" className="gap-2"><FolderInput size={18} /> Move</Button>
           </div>


        </div>


        {/* Right Column */}
        <div className="space-y-8 pt-2">
           
           {/* Top Align Button */}
           <div className="flex justify-end">
              <Button variant="outline" size="sm" className="px-5">Manage</Button>
           </div>


           <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Category</h4>
                <div className="text-lg font-bold text-gray-900">{video.category}</div>
                {video.subCategory && <div className="text-gray-500 font-medium">{video.subCategory}</div>}
              </div>


              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {video.tags.map(tag => (
                     <span key={tag} className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                        {tag}
                     </span>
                  ))}
                </div>
              </div>


              <div>
                 <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Original Link</h4>
                 <a href={video.originalUrl} target="_blank" rel="noreferrer" className="block">
                    <button className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-white font-medium shadow-md bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] hover:opacity-90 transition">
                       <InstagramExternalIcon size={16} />
                       View on Instagram
                    </button>
                 </a>
              </div>
           </div>


        </div>
      </div>


      {/* Mobile Layout */}
      <div className="md:hidden -mx-4 sm:mx-0">
         {/* Full width poster */}
         <div className="relative w-full aspect-[9/8] bg-black">
            <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover opacity-90" />
            
            {/* Overlay Icons */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start bg-gradient-to-b from-black/60 to-transparent">
               <button onClick={() => navigate(-1)} className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white">
                  <ArrowLeft size={24} />
               </button>
               <button className="p-2 bg-black/20 backdrop-blur-md rounded-full text-white">
                  <IOSShareIcon size={20} />
               </button>
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white">
                  <Play size={32} fill="currentColor" className="ml-1" />
               </div>
            </div>
         </div>


         <div className="px-5 pt-6 pb-6">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-2">
               {video.title}
            </h1>
            
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
               <span className="font-semibold text-gray-900">{video.author}</span>
               <span>•</span>
               <span>{video.savedAt}</span>
            </div>


            <div className="flex flex-wrap gap-2 mb-8">
               <span className="px-3 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-bold uppercase tracking-wide">
                  {video.category}
               </span>
               {video.tags.slice(0,3).map(tag => (
                  <span key={tag} className="px-2 py-1 text-gray-500 text-xs font-medium">
                     {tag}
                  </span>
               ))}
            </div>


            <div className="bg-gray-50 rounded-xl p-5 mb-6">
               <p className="text-gray-900 font-medium leading-relaxed mb-4">
                  {video.summary}
               </p>
               <ul className="space-y-2">
                  {video.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-gray-600 text-sm">
                       <span className="mt-1.5 w-1 h-1 bg-gray-400 rounded-full flex-shrink-0"></span>
                       <span className="leading-relaxed">{bullet}</span>
                    </li>
                  ))}
               </ul>
            </div>


            <div className="border-t border-gray-100 pt-4 mb-6">
               <button 
                 onClick={() => setTranscriptOpen(!transcriptOpen)}
                 className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-3"
               >
                  Transcript
                  <ChevronDown size={16} className={`transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
               </button>
               {transcriptOpen && (
                  <p className="text-gray-600 text-sm leading-relaxed">
                     {video.transcript}
                  </p>
               )}
            </div>


            {/* Action Buttons Above Bottom Nav */}
            <div className="flex gap-3 mb-6">
               <a 
                 href={video.originalUrl} 
                 target="_blank" 
                 rel="noreferrer"
                 className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white rounded-xl text-sm font-bold shadow-md"
               >
                  <InstagramExternalIcon size={16} className="text-white" />
                  Open on Instagram
               </a>


               <button className="px-4 py-3 text-red-600 bg-red-50 rounded-xl">
                  <Trash2 size={20} />
               </button>
            </div>
         </div>
      </div>


      {/* Mobile Bottom Navigation (Always visible) */}
      <MobileBottomNav onAddClick={() => {}} />
    </div>
  );
};
