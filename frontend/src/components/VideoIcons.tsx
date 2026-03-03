import { API_BASE } from "../utils/api";
import React from 'react';
import topicIcon from '../assets/topic-icon.svg';
import categoryIcon from '../assets/category-icon.svg';
import hashtagIcon from '../assets/hashtag-icon.svg';

interface IconProps {
  className?: string;
}

export const TopicIcon: React.FC<IconProps> = ({ className = "w-6 h-6" }) => (
  <img 
    src={topicIcon} 
    className={className} 
    alt="Topic"
  />
);

export const CategoryIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <img 
    src={categoryIcon} 
    className={className} 
    alt="Category"
  />
);

export const HashtagIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <img 
    src={hashtagIcon} 
    className={className} 
    alt="Hashtag"
  />
);

export const IOSShareIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2v13" />
    <path d="m16 6-4-4-4 4" />
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
  </svg>
);
