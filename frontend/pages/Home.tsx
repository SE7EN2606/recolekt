import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Wand2, Clipboard } from 'lucide-react';
import { Button } from '../components/Button';


export const Home: React.FC = () => {
  const [url, setUrl] = useState('');
  const navigate = useNavigate();


  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    // Simulate saving logic, then redirect
    navigate('/gallery');
  };


  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };


  return (
    <div className="flex flex-col items-center">
      
      {/* Hero Section */}
      <div className="w-full max-w-4xl mx-auto pt-16 pb-24 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-50 text-primary-700 text-sm font-medium mb-8 animate-fade-in">
          <Wand2 size={16} />
          <span>Save & Organize Short Videos</span>
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold text-gray-900 tracking-tight mb-6">
          Your Personal <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-primary-400">Video Library</span>
        </h1>
        
        <p className="text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-12 leading-relaxed">
          Save Instagram Reels, organize them into collections, and let AI help you categorize what matters most.
        </p>


        {/* Input Section - Responsive Layout */}
        <div className="w-full max-w-3xl mx-auto mt-8">
           <form onSubmit={handleSave} className="flex flex-col gap-4">
              
              {/* Input Wrapper (White Box) */}
              <div className="relative flex-1 group">
                <input 
                  type="text" 
                  placeholder="Insert instagram link here" 
                  className="w-full h-[60px] pl-6 pr-36 md:pr-64 text-lg bg-white border border-gray-200 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all outline-none text-gray-900 placeholder-gray-500 shadow-sm"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                
                {/* Paste Button - Always inside (mobile & desktop) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 md:hidden">
                  <button 
                     type="button"
                     onClick={handlePaste}
                     className="flex items-center gap-2 px-4 h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-all text-sm border border-gray-200"
                   >
                     <Clipboard size={18} />
                     Paste
                   </button>
                </div>

                {/* Both Buttons - Desktop only */}
                <div className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-2">
                  {/* Paste Button */}
                  <button 
                     type="button"
                     onClick={handlePaste}
                     className="flex items-center gap-2 px-4 h-[44px] bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-all text-sm border border-gray-200"
                   >
                     <Clipboard size={18} />
                     Paste
                   </button>
                   
                   {/* Download Button */}
                   <button 
                     type="submit"
                     className="flex items-center gap-2 px-6 h-[44px] bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg transition-all text-sm shadow-lg shadow-primary-600/20"
                   >
                     Download
                   </button>
                </div>
              </div>

              {/* Download Button - Mobile only (below input) */}
              <button 
                type="submit"
                className="md:hidden h-[60px] px-10 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl transition-all text-lg shadow-xl shadow-primary-600/20"
              >
                Download
              </button>
           </form>
        </div>


        <div className="flex items-center justify-center gap-8 text-sm text-gray-500 font-medium mt-12">
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Public videos only
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Privacy respected
          </div>
           <div className="flex items-center gap-2">
            <span className="text-green-500">✓</span> Fast & reliable
          </div>
        </div>
      </div>


      {/* Features Grid */}
      <div className="w-full max-w-[1100px] px-4 md:px-8 py-16 bg-white border border-gray-100 rounded-3xl shadow-sm mb-16">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-16">How It Works</h2>
        
        <div className="grid md:grid-cols-3 gap-12">
          {/* Step 1 */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-primary-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary-600/30 mb-6">
              1
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Paste Link</h3>
            <p className="text-gray-500 leading-relaxed">
              Share any public Instagram Reel URL
            </p>
          </div>


          {/* Step 2 */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-primary-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary-600/30 mb-6">
              2
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Auto-Organize</h3>
            <p className="text-gray-500 leading-relaxed">
              Our AI categorizes and extracts key information
            </p>
          </div>


          {/* Step 3 */}
          <div className="text-center">
             <div className="w-16 h-16 mx-auto bg-primary-600 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary-600/30 mb-6">
              3
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Explore & Share</h3>
            <p className="text-gray-500 leading-relaxed">
              Browse your collection and discover similar content
            </p>
          </div>
        </div>
      </div>


      {/* CTA */}
      <div className="text-center mb-20">
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to get started?</h2>
        <p className="text-gray-500 mb-8 text-lg">Scroll up to save your first Instagram Reel or explore our gallery</p>
        <Button onClick={() => navigate('/gallery')} size="lg" className="px-8 py-4 text-lg gap-2 shadow-xl shadow-primary-600/20">
          View Gallery <ArrowRight size={20} />
        </Button>
      </div>


    </div>
  );
};
