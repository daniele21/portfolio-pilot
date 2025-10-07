import React from 'react';

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const ActionButton: React.FC<React.PropsWithChildren<{
  variant?: Variant;
  size?: Size;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}>> = ({ variant = 'primary', size = 'md', onClick, disabled, title, type = 'button', children, className }) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold shadow transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizeMap: Record<string, string> = {
    sm: 'px-2 py-1 text-sm h-8',
    md: 'px-3 py-2 text-sm h-10',
  };
  const variantMap: Record<string, string> = {
    primary: 'bg-indigo-600/95 hover:bg-indigo-500 text-white focus:ring-indigo-400',
    secondary: 'bg-blue-600/95 hover:bg-blue-500 text-white focus:ring-blue-400',
    success: 'bg-green-600/95 hover:bg-green-500 text-white focus:ring-green-400',
    danger: 'bg-red-700/95 hover:bg-red-600 text-white focus:ring-red-400',
    ghost: 'bg-gray-700/70 hover:bg-gray-600 text-gray-200 focus:ring-gray-500',
  };
  const cls = `${base} ${sizeMap[size]} ${variantMap[variant]} ${className ?? ''}`.trim();
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
};

export default ActionButton;
