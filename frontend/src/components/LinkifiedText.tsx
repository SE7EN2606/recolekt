import { API_BASE } from "../utils/api";
import React from 'react';

interface LinkifiedTextProps {
  text: string;
}

export const LinkifiedText: React.FC<LinkifiedTextProps> = ({ text }) => {
  if (!text) return <>{text}</>;

  const combinedRegex =
    /(https?:\/\/[^\s]+|@[a-zA-Z0-9._]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;

  return (
    <>
      {text.split(combinedRegex).map((part, index) => {
        if (!part) return null;

        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 underline"
            >
              {part}
            </a>
          );
        }

        if (/^@[a-zA-Z0-9._]+$/.test(part)) {
          const username = part.replace('@', '');
          return (
            <a
              key={index}
              href={`https://www.instagram.com/${username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-semibold"
            >
              {part}
            </a>
          );
        }

        if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?$/.test(part)) {
          return (
            <a
              key={index}
              href={`https://${part}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 underline"
            >
              {part}
            </a>
          );
        }

        return part;
      })}
    </>
  );
};
