import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ChevronRight, Search, Folder, Plus } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Button } from './Button';
import { InputModal } from './InputModal';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const { folders, addFolder } = useData();
  const [isVisible, setIsVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 400);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  const handleNewCollection = (name: string) => {
    addFolder(name);
    setIsModalOpen(false);
  };

  if (!isVisible) return null;

  return (
    <>
      <div 
        className={`
          fixed inset-0 z-[100] bg-[#f8fafc]
          transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]
          ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}
        `}
      >
        <div className="flex flex-col h-full max-w-[1100px] mx-auto px-4">
          
          {/* Header */}
          <div className="h-[85px] flex items-center justify-between flex-shrink-0 border-b border-gray-100">
             <Link 
               to="/" 
               onClick={onClose}
               className="flex items-center gap-2 text-gray-900 hover:text-primary-600 transition-colors"
             >
               <img 
                 alt="recolekt_icon" 
                 className="h-8 md:h-9 transition-transform duration-100" 
                 src="https://raw.githubusercontent.com/SE7EN2606/recolekt/refs/heads/main/recolekt_icon.svg" 
                 style={{ transform: 'scale(1)' }}
               />
               <span className="text-lg font-bold">Home</span>
             </Link>
             <button 
               onClick={onClose}
               className="p-2 -mr-2 text-gray-500 bg-gray-100 rounded-full transition-colors hover:bg-gray-200"
             >
               <X size={20} />
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto py-6">
            
            {/* Search in Menu */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full bg-white border border-gray-200 rounded-xl py-3 pl-10 pr-4 text-base focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
              />
            </div>

            {/* New Collection Button */}
            <div className="mb-8">
              <Button 
                fullWidth 
                variant="primary" 
                onClick={() => setIsModalOpen(true)}
                className="shadow-lg shadow-primary-600/20 gap-2 py-3"
              >
                <Plus size={18} />
                <span>New Collection</span>
              </Button>
            </div>

            <nav className="space-y-1">
               <div className="py-6">
                 <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 px-4">Collections</h3>
                 <div className="space-y-1">
                   {folders.map(folder => (
                      <Link 
                        key={folder.id}
                        to={`/gallery/${folder.id === 'all' ? '' : folder.id}`}
                        onClick={onClose}
                        className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-white transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <Folder size={20} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                          <span className="text-gray-700 font-medium">{folder.name}</span>
                        </div>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-md">{folder.itemCount}</span>
                      </Link>
                   ))}
                 </div>
               </div>
            </nav>

            <div className="mt-auto px-4 pb-8">
              <Link 
                to="/"
                onClick={onClose}
                className="block w-full py-4 bg-gray-100 text-gray-900 text-center font-bold rounded-xl active:scale-95 transition-transform"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>

      <InputModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleNewCollection}
        title="Create New Collection"
        placeholder="Collection name"
      />
    </>
  );
};