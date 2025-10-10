import React from 'react';

interface LoadingCardProps {
  loading: boolean;
  className?: string;
  skeleton?: React.ReactNode;
  children?: React.ReactNode;
}

const DefaultSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-4 bg-white/10 rounded w-1/3 mb-3" />
    <div className="h-6 bg-white/10 rounded w-1/4 mb-3" />
    <div className="space-y-2">
      <div className="h-3 bg-white/8 rounded w-full" />
      <div className="h-3 bg-white/8 rounded w-5/6" />
    </div>
  </div>
);

const LoadingCard: React.FC<LoadingCardProps> = ({ loading, className = '', skeleton, children }) => {
  return (
    <div className={className}>
      {loading ? (skeleton || <DefaultSkeleton />) : children}
    </div>
  );
};

export default LoadingCard;
